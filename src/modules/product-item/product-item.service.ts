import type {
  ProductItemFavorite,
  ProductItemFavoriteChange,
  ProductItemFavoritePage,
} from '@meerkapp/wms-contracts';
import { PRODUCT_ITEM_FAVORITE_CHANGED_EVENT } from '@meerkapp/wms-contracts';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SyncGateway } from '../sync/sync.gateway';

@Injectable()
export class ProductItemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncGateway: SyncGateway,
  ) {}

  async getStats(productCollectionId: number, warehouseId: number) {
    const stats = await this.prisma.productItemStats.findMany({
      where: {
        warehouseId,
        productItem: { productCollectionId },
      },
    });

    return stats.map((item) => ({
      ...item,
      quantity: item.quantity.toString(),
      retailPrice: item.retailPrice?.toString() ?? null,
    }));
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
    const productExists = await this.prisma.productItem.findUnique({
      where: { id: productItemId },
      select: { id: true },
    });
    if (!productExists) throw new NotFoundException(`Product item ${productItemId} not found`);

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
}
