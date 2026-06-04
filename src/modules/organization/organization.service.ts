import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto) {
    const organization = await this.prisma.organization.create({ data: dto });
    return organization;
  }

  async stats(id: number) {
    const [warehouseCount, employeeCount] = await Promise.all([
      this.prisma.warehouse.count({ where: { organizationId: id } }),
      this.prisma.employee.count({ where: { warehouse: { organizationId: id } } }),
    ]);
    return { warehouseCount, employeeCount };
  }

  async update(id: number, dto: UpdateOrganizationDto) {
    const organization = await this.prisma.organization
      .update({ where: { id }, data: dto })
      .catch(() => {
        throw new NotFoundException(`Organization ${id} not found`);
      });
    return organization;
  }
}
