import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SyncGateway } from '../sync/sync.gateway';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncGateway: SyncGateway,
  ) {}

  async create(dto: CreateWarehouseDto) {
    const warehouse = await this.prisma.warehouse.create({ data: dto });
    this.syncGateway.notifyChange('warehouse', { added: [warehouse] });
    return warehouse;
  }

  async update(id: number, dto: UpdateWarehouseDto) {
    const warehouse = await this.prisma.warehouse
      .update({ where: { id }, data: dto })
      .catch(() => {
        throw new NotFoundException(`Warehouse ${id} not found`);
      });
    this.syncGateway.notifyChange('warehouse', { modified: [warehouse] });
    return warehouse;
  }
}
