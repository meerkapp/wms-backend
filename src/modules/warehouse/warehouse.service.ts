import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DirectPriceListAssignmentService } from '../price-list/direct-price-list-assignment.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateWarehouseWithPriceListAssignmentDto } from './dto/create-warehouse-with-price-list-assignment.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { UpdateWarehouseWithPriceListAssignmentDto } from './dto/update-warehouse-with-price-list-assignment.dto';

@Injectable()
export class WarehouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directAssignments: DirectPriceListAssignmentService,
  ) {}

  async create(dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({ data: dto });
  }

  async createWithPriceListAssignment(dto: CreateWarehouseWithPriceListAssignmentDto) {
    const { priceListId, ...warehouseData } = dto;
    return this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.create({ data: warehouseData });
      await this.directAssignments.setWarehouse(tx, warehouse.id, priceListId);
      return warehouse;
    });
  }

  async update(id: number, dto: UpdateWarehouseDto) {
    try {
      return await this.prisma.warehouse.update({ where: { id }, data: dto });
    } catch (error) {
      this.rethrowNotFound(error, id);
    }
  }

  async updateWithPriceListAssignment(id: number, dto: UpdateWarehouseWithPriceListAssignmentDto) {
    const { priceListId, ...warehouseData } = dto;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const warehouse = await tx.warehouse.update({ where: { id }, data: warehouseData });
        await this.directAssignments.setWarehouse(tx, id, priceListId);
        return warehouse;
      });
    } catch (error) {
      this.rethrowNotFound(error, id);
    }
  }

  private rethrowNotFound(error: unknown, id: number): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new NotFoundException(`Warehouse ${id} not found`);
    }
    throw error;
  }
}
