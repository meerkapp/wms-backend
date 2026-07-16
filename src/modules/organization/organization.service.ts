import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DirectPriceListAssignmentService } from '../price-list/direct-price-list-assignment.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CreateOrganizationWithPriceListAssignmentDto } from './dto/create-organization-with-price-list-assignment.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateOrganizationWithPriceListAssignmentDto } from './dto/update-organization-with-price-list-assignment.dto';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directAssignments: DirectPriceListAssignmentService,
  ) {}

  async create(dto: CreateOrganizationDto) {
    return this.prisma.organization.create({ data: dto });
  }

  async createWithPriceListAssignment(dto: CreateOrganizationWithPriceListAssignmentDto) {
    const { priceListId, ...organizationData } = dto;
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: organizationData });
      await this.directAssignments.setOrganization(tx, organization.id, priceListId);
      return organization;
    });
  }

  async stats(id: number) {
    const [warehouseCount, employeeCount] = await Promise.all([
      this.prisma.warehouse.count({ where: { organizationId: id } }),
      this.prisma.employee.count({ where: { warehouse: { organizationId: id } } }),
    ]);
    return { warehouseCount, employeeCount };
  }

  async update(id: number, dto: UpdateOrganizationDto) {
    try {
      return await this.prisma.organization.update({ where: { id }, data: dto });
    } catch (error) {
      this.rethrowNotFound(error, id);
    }
  }

  async updateWithPriceListAssignment(
    id: number,
    dto: UpdateOrganizationWithPriceListAssignmentDto,
  ) {
    const { priceListId, ...organizationData } = dto;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.update({
          where: { id },
          data: organizationData,
        });
        await this.directAssignments.setOrganization(tx, id, priceListId);
        return organization;
      });
    } catch (error) {
      this.rethrowNotFound(error, id);
    }
  }

  private rethrowNotFound(error: unknown, id: number): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new NotFoundException(`Organization ${id} not found`);
    }
    throw error;
  }
}
