import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehouseService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWarehouseDto) {
    const warehouse = await this.prisma.warehouse.create({ data: dto });
    return warehouse;
  }

  async update(id: number, dto: UpdateWarehouseDto) {
    const warehouse = await this.prisma.warehouse.update({ where: { id }, data: dto }).catch(() => {
      throw new NotFoundException(`Warehouse ${id} not found`);
    });
    return warehouse;
  }
}
