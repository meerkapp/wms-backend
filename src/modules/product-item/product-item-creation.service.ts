import type { CharacteristicsScheme } from '@meerkapp/wms-contracts';
import { ProductTypeConfigurationSchema } from '@meerkapp/wms-contracts';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateProductItemDto } from './dto/create-product-item.dto';
import { PUBLIC_PRODUCT_ITEM_SELECT, PublicProductItemRow } from './product-item.select';
import {
  normalizeManualSku,
  ProductSkuError,
  renderSequentialSku,
  renderTemplateSku,
  templateUsesSequence,
  validateProductCharacteristics,
} from './product-sku';

const SKU_COLLISION_ATTEMPTS = 5;

@Injectable()
export class ProductItemCreationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductItemDto): Promise<PublicProductItemRow> {
    const existing = await this.findByCreationRequest(dto.creationRequestId);
    if (existing) return existing;

    for (let attempt = 1; attempt <= SKU_COLLISION_ATTEMPTS; attempt += 1) {
      let generatedSku: string | null = null;
      let usedSequence = false;

      try {
        return await this.prisma.$transaction(async (tx) => {
          const lockedTypes = await tx.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`
              SELECT id
              FROM product_type
              WHERE id = ${dto.productTypeId}
              FOR SHARE
            `,
          );
          if (lockedTypes.length === 0) {
            throw new NotFoundException(`ProductType ${dto.productTypeId} not found`);
          }

          const productType = await tx.productType.findUnique({
            where: { id: dto.productTypeId },
          });
          if (!productType) {
            throw new NotFoundException(`ProductType ${dto.productTypeId} not found`);
          }

          const parsedConfiguration = ProductTypeConfigurationSchema.safeParse({
            name: productType.name,
            defaultWriteoffStrategy: productType.defaultWriteoffStrategy,
            skuMode: productType.skuMode,
            skuTemplate: productType.skuTemplate,
            characteristicsScheme: productType.characteristicsScheme,
          });
          if (!parsedConfiguration.success) {
            throw new ConflictException(
              `ProductType ${dto.productTypeId} has an invalid SKU configuration`,
            );
          }

          const configuration = parsedConfiguration.data;
          const characteristicsScheme = configuration.characteristicsScheme ?? null;

          try {
            validateProductCharacteristics(characteristicsScheme, dto.characteristics);
            const skuResult = await this.generateSku(
              tx,
              configuration.skuMode,
              configuration.skuTemplate ?? null,
              characteristicsScheme,
              dto.characteristics,
              dto.sku,
            );
            generatedSku = skuResult.sku;
            usedSequence = skuResult.usedSequence;
          } catch (error) {
            if (error instanceof ProductSkuError) {
              throw new BadRequestException(error.message);
            }
            throw error;
          }

          return tx.productItem.create({
            data: {
              sku: generatedSku,
              creationRequestId: dto.creationRequestId,
              name: dto.name,
              productCollectionId: dto.productCollectionId,
              productTypeId: dto.productTypeId,
              productBrandId: dto.productBrandId,
              productMeasureId: dto.productMeasureId,
              countryId: dto.countryId,
              characteristics: dto.characteristics as Prisma.InputJsonValue,
              writeoffStrategy: dto.writeoffStrategy,
              isPublic: dto.isPublic,
              packages: {
                create: {
                  isBase: true,
                  conversionFactor: 1,
                },
              },
            },
            select: PUBLIC_PRODUCT_ITEM_SELECT,
          });
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const idempotentResult = await this.findByCreationRequest(dto.creationRequestId);
          if (idempotentResult) return idempotentResult;

          if (usedSequence && attempt < SKU_COLLISION_ATTEMPTS) continue;
          throw new ConflictException(
            generatedSku === null ? 'Product item already exists' : `SKU ${generatedSku} exists`,
          );
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
          throw new BadRequestException('One or more referenced product entities do not exist');
        }
        throw error;
      }
    }

    throw new ConflictException('Unable to allocate a unique SKU');
  }

  private findByCreationRequest(creationRequestId: string): Promise<PublicProductItemRow | null> {
    return this.prisma.productItem.findUnique({
      where: { creationRequestId },
      select: PUBLIC_PRODUCT_ITEM_SELECT,
    });
  }

  private async generateSku(
    tx: Prisma.TransactionClient,
    mode: 'SEQUENTIAL' | 'TEMPLATE' | 'MANUAL',
    template: string | null,
    scheme: CharacteristicsScheme | null,
    characteristics: Record<string, unknown>,
    requestedSku?: string,
  ): Promise<{ sku: string; usedSequence: boolean }> {
    if (mode === 'MANUAL') {
      if (requestedSku === undefined) {
        throw new ProductSkuError('SKU is required for MANUAL sku mode');
      }
      return { sku: normalizeManualSku(requestedSku), usedSequence: false };
    }
    if (requestedSku !== undefined) {
      throw new ProductSkuError('SKU cannot be provided for an automatically generated SKU');
    }

    if (mode === 'SEQUENTIAL') {
      const sequence = await this.nextSkuSequence(tx);
      return { sku: renderSequentialSku(sequence), usedSequence: true };
    }

    if (template === null) throw new ProductSkuError('SKU template is not configured');
    const usesSequence = templateUsesSequence(template);
    const sequence = usesSequence ? await this.nextSkuSequence(tx) : null;
    return {
      sku: renderTemplateSku(template, scheme, characteristics, sequence),
      usedSequence: usesSequence,
    };
  }

  private async nextSkuSequence(tx: Prisma.TransactionClient): Promise<bigint> {
    const rows = await tx.$queryRaw<Array<{ value: string }>>(
      Prisma.sql`SELECT nextval('product_sku_seq')::text AS value`,
    );
    const value = rows[0]?.value;
    if (value === undefined) throw new Error('SKU sequence did not return a value');
    return BigInt(value);
  }
}
