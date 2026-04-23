import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SyncGateway } from '../sync/sync.gateway';
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { UpdateProductTypeDto } from './dto/update-product-type.dto';

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class ProductTypeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncGateway: SyncGateway,
  ) {}

  async findAll() {
    return this.prisma.productType.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: number) {
    const type = await this.prisma.productType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException(`ProductType ${id} not found`);
    return type;
  }

  async create(dto: CreateProductTypeDto) {
    const { characteristicsScheme, ...rest } = dto;
    const result = await this.prisma.productType.create({
      data: { ...rest, characteristicsScheme: toJsonInput(characteristicsScheme) },
    });
    this.syncGateway.notifyChange('product_type', { added: [result] });
    return result;
  }

  async update(id: number, dto: UpdateProductTypeDto) {
    const type = await this.prisma.productType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException(`ProductType ${id} not found`);
    const { characteristicsScheme, ...rest } = dto;
    const result = await this.prisma.productType.update({
      where: { id },
      data: {
        ...rest,
        ...(characteristicsScheme !== undefined && {
          characteristicsScheme: toJsonInput(characteristicsScheme),
        }),
      },
    });
    this.syncGateway.notifyChange('product_type', { modified: [result] });
    return result;
  }
}
