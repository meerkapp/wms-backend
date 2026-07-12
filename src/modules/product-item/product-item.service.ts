import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ProductItemService {
  constructor(private readonly prisma: PrismaService) {}

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
