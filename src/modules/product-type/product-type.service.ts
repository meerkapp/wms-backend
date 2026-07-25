import { ProductTypeConfigurationSchema } from '@meerkapp/wms-contracts';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZodValidationException } from 'nestjs-zod';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { UpdateProductTypeDto } from './dto/update-product-type.dto';

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class ProductTypeService {
  constructor(private readonly prisma: PrismaService) {}

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
    return result;
  }

  async update(id: number, dto: UpdateProductTypeDto) {
    const type = await this.prisma.productType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException(`ProductType ${id} not found`);

    const mergedConfiguration = ProductTypeConfigurationSchema.safeParse({
      name: dto.name ?? type.name,
      defaultWriteoffStrategy: dto.defaultWriteoffStrategy ?? type.defaultWriteoffStrategy,
      skuMode: dto.skuMode ?? type.skuMode,
      skuTemplate:
        dto.skuTemplate !== undefined
          ? dto.skuTemplate
          : dto.skuMode !== undefined && dto.skuMode !== 'TEMPLATE'
            ? null
            : type.skuTemplate,
      characteristicsScheme:
        dto.characteristicsScheme !== undefined
          ? dto.characteristicsScheme
          : type.characteristicsScheme,
    });
    if (!mergedConfiguration.success) {
      throw new ZodValidationException(mergedConfiguration.error);
    }

    const configuration = mergedConfiguration.data;
    const result = await this.prisma.productType.update({
      where: { id },
      data: {
        name: configuration.name,
        defaultWriteoffStrategy: configuration.defaultWriteoffStrategy,
        skuMode: configuration.skuMode,
        skuTemplate: configuration.skuTemplate ?? null,
        characteristicsScheme: toJsonInput(configuration.characteristicsScheme ?? null),
      },
    });
    return result;
  }
}
