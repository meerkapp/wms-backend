import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { mingoToPrisma } from '../../common/mingo/mingo-to-prisma';
import { SyncResult } from '../sync/sync.service';

@Injectable()
export class ProductItemService {
  constructor(private readonly prisma: PrismaService) {}

  async fetch(selector: Record<string, unknown>): Promise<SyncResult> {
    const where = mingoToPrisma(selector);
    const items = await this.prisma.productItem.findMany({
      where,
      include: {
        productBrand: true,
        productMeasure: true,
      },
      orderBy: { name: 'asc' },
    });
    return { items };
  }

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
}
