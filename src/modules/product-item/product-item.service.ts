import type {
  ProductItemArchivePage,
  ProductItemFavorite,
  ProductItemFavoriteChange,
  ProductItemFavoritePage,
  ProductItemWithRelations,
} from '@meerkapp/wms-contracts';
import { PRODUCT_ITEM_FAVORITE_CHANGED_EVENT } from '@meerkapp/wms-contracts';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SyncGateway } from '../sync/sync.gateway';
import { CreateProductItemDto } from './dto/create-product-item.dto';
import { ProductItemCreationService } from './product-item-creation.service';
import { PUBLIC_PRODUCT_ITEM_SELECT, PublicProductItemRow } from './product-item.select';

const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

@Injectable()
export class ProductItemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncGateway: SyncGateway,
    private readonly creationService: ProductItemCreationService,
  ) {}

  async create(dto: CreateProductItemDto): Promise<ProductItemWithRelations> {
    const created = await this.creationService.create(dto);
    return this.serializeProductItem(created);
  }

  async getStats(productCollectionId: number, warehouseId: number) {
    const stats = await this.prisma.productItemStats.findMany({
      where: {
        warehouseId,
        productItem: { productCollectionId, archivedAt: null },
      },
    });

    return stats.map((item) => ({
      ...item,
      quantity: item.quantity.toString(),
      retailPrice: item.retailPrice?.toString() ?? null,
    }));
  }

  async findArchived(page = 1, limit = 20): Promise<ProductItemArchivePage> {
    const where = { archivedAt: { not: null } } satisfies Prisma.ProductItemWhereInput;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.productItem.findMany({
        where,
        select: PUBLIC_PRODUCT_ITEM_SELECT,
        orderBy: [{ sku: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.productItem.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.serializeProductItem(row)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findByBarcode(code: string): Promise<ProductItemWithRelations> {
    const barcode = await this.prisma.productBarcode.findFirst({
      where: { code },
      orderBy: { id: 'asc' },
      include: {
        productItem: { select: PUBLIC_PRODUCT_ITEM_SELECT },
      },
    });
    if (!barcode) throw new NotFoundException(`Product barcode ${code} not found`);
    return this.serializeProductItem(barcode.productItem);
  }

  archive(employeeId: string, productItemId: number): Promise<ProductItemWithRelations> {
    return this.runSerializableTransaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM product_item WHERE id = ${productItemId} FOR UPDATE`,
      );
      if (lockedRows.length === 0) {
        throw new NotFoundException(`Product item ${productItemId} not found`);
      }

      const productItem = await tx.productItem.findUnique({
        where: { id: productItemId },
        select: PUBLIC_PRODUCT_ITEM_SELECT,
      });
      if (!productItem) throw new NotFoundException(`Product item ${productItemId} not found`);
      if (productItem.archivedAt !== null) return this.serializeProductItem(productItem);

      const nonZeroBalances = await tx.$queryRaw<Array<{ warehouseId: number }>>(Prisma.sql`
        SELECT warehouse_id AS "warehouseId"
        FROM product_shipment
        WHERE product_item_id = ${productItemId}
        GROUP BY warehouse_id
        HAVING COALESCE(SUM(quantity), 0) <> 0
        LIMIT 1
      `);
      if (nonZeroBalances.length > 0) {
        throw new ConflictException('Product item stock balance is not zero');
      }

      const archivedAt = new Date();
      const archived = await tx.productItem.update({
        where: { id: productItemId },
        data: { archivedAt, archivedByEmployeeId: employeeId, updatedAt: archivedAt },
        select: PUBLIC_PRODUCT_ITEM_SELECT,
      });
      return this.serializeProductItem(archived);
    });
  }

  async restore(productItemId: number): Promise<ProductItemWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const productItem = await tx.productItem.findUnique({
        where: { id: productItemId },
        select: PUBLIC_PRODUCT_ITEM_SELECT,
      });
      if (!productItem) throw new NotFoundException(`Product item ${productItemId} not found`);
      if (productItem.archivedAt === null) return this.serializeProductItem(productItem);

      const restoredAt = new Date();
      const restored = await tx.productItem.update({
        where: { id: productItemId },
        data: { archivedAt: null, archivedByEmployeeId: null, updatedAt: restoredAt },
        select: PUBLIC_PRODUCT_ITEM_SELECT,
      });

      // These rows were deliberately removed from active offline read-models.
      // Touching them makes every timestamp cursor replay the complete product
      // graph after restoration.
      await tx.productBarcode.updateMany({
        where: { productItemId },
        data: { updatedAt: restoredAt },
      });
      await tx.productPackage.updateMany({
        where: { productItemId },
        data: { updatedAt: restoredAt },
      });
      await tx.productShipment.updateMany({
        where: { productItemId },
        data: { updatedAt: restoredAt },
      });
      await tx.productItemStats.updateMany({
        where: { productItemId },
        data: { updatedAt: restoredAt },
      });

      return this.serializeProductItem(restored);
    });
  }

  async findFavorites(employeeId: string, page = 1, limit = 20): Promise<ProductItemFavoritePage> {
    const skip = (page - 1) * limit;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.productItemFavorite.findMany({
        where: { employeeId },
        orderBy: { productItemId: 'asc' },
        skip,
        take: limit,
        select: { productItemId: true, createdAt: true },
      }),
      this.prisma.productItemFavorite.count({ where: { employeeId } }),
    ]);

    return {
      items: rows.map((row) => this.serializeFavorite(row)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async addFavorite(employeeId: string, productItemId: number): Promise<ProductItemFavorite> {
    const product = await this.prisma.productItem.findUnique({
      where: { id: productItemId },
      select: { id: true, archivedAt: true },
    });
    if (!product) throw new NotFoundException(`Product item ${productItemId} not found`);
    if (product.archivedAt !== null) {
      throw new ConflictException('Archived product items cannot be added to favorites');
    }

    const favorite = await this.prisma.productItemFavorite.upsert({
      where: { employeeId_productItemId: { employeeId, productItemId } },
      update: {},
      create: { employeeId, productItemId },
      select: { productItemId: true, createdAt: true },
    });
    const serialized = this.serializeFavorite(favorite);
    this.emitFavoriteChange(employeeId, {
      productItemId,
      isFavorite: true,
      createdAt: serialized.createdAt,
    });
    return serialized;
  }

  async removeFavorite(employeeId: string, productItemId: number): Promise<void> {
    await this.prisma.productItemFavorite.deleteMany({ where: { employeeId, productItemId } });
    this.emitFavoriteChange(employeeId, {
      productItemId,
      isFavorite: false,
      createdAt: null,
    });
  }

  private serializeFavorite(favorite: {
    productItemId: number;
    createdAt: Date;
  }): ProductItemFavorite {
    return {
      productItemId: favorite.productItemId,
      createdAt: favorite.createdAt.toISOString(),
    };
  }

  private emitFavoriteChange(employeeId: string, change: ProductItemFavoriteChange): void {
    this.syncGateway.emitUserEvent(PRODUCT_ITEM_FAVORITE_CHANGED_EVENT, employeeId, change);
  }

  private serializeProductItem(row: PublicProductItemRow): ProductItemWithRelations {
    return {
      ...row,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      productBrand:
        row.productBrand === null
          ? null
          : { ...row.productBrand, updatedAt: row.productBrand.updatedAt.toISOString() },
      productMeasure: {
        ...row.productMeasure,
        updatedAt: row.productMeasure.updatedAt.toISOString(),
      },
    };
  }

  private async runSerializableTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const shouldRetry =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!shouldRetry || attempt === SERIALIZABLE_TRANSACTION_ATTEMPTS) throw error;
      }
    }

    throw new Error('Serializable transaction retry limit exceeded');
  }
}
