import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SyncGateway } from '../sync/sync.gateway';
import { CreateStockDto } from './dto/create-stock.dto';
import { UpdateStockDto } from './dto/update-stock.dto';

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncGateway: SyncGateway,
  ) {}

  async create(dto: CreateStockDto) {
    const stock = await this.prisma.stock.create({ data: dto });
    this.syncGateway.notifyChange('stock', { added: [stock] });
    return stock;
  }

  async update(id: number, dto: UpdateStockDto) {
    const stock = await this.prisma.stock
      .update({ where: { id }, data: dto })
      .catch(() => {
        throw new NotFoundException(`Stock ${id} not found`);
      });
    this.syncGateway.notifyChange('stock', { modified: [stock] });
    return stock;
  }
}
