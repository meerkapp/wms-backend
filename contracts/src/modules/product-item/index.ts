import { z } from 'zod';
import { ProductItemModelSchema } from '../../generated/schemas/variants/pure/ProductItem.pure';
import { ProductBrandSchema } from '../product-brand';
import { ProductMeasureSchema } from '../product-measure';
import { CurrencyCodeSchema } from '../../generated/schemas/enums/CurrencyCode.schema';

export const ProductItemSchema = ProductItemModelSchema.omit({
  productCollection: true,
  productType: true,
  productBrand: true,
  productMeasure: true,
  country: true,
  barcodes: true,
  packages: true,
  shipments: true,
}).extend({ updatedAt: z.string() });

export const ProductItemWithRelationsSchema = ProductItemSchema.extend({
  productBrand: ProductBrandSchema.nullable(),
  productMeasure: ProductMeasureSchema.nullable(),
});

export const ProductItemStatsQuerySchema = z.object({
  productCollectionId: z.coerce.number().int().positive(),
  warehouseId: z.coerce.number().int().positive(),
});

export const ProductItemStatsSchema = z.object({
  id: z.number().int(),
  productItemId: z.number().int(),
  warehouseId: z.number().int(),
  quantity: z.string(),
  retailPrice: z.string().nullable(),
  currency: CurrencyCodeSchema.nullable(),
});

export type ProductItem = z.infer<typeof ProductItemSchema>;
export type ProductItemWithRelations = z.infer<typeof ProductItemWithRelationsSchema>;
export type ProductItemStatsQuery = z.infer<typeof ProductItemStatsQuerySchema>;
export type ProductItemStats = z.infer<typeof ProductItemStatsSchema>;
