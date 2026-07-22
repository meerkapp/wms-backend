import { z } from 'zod';
import { ProductItemModelSchema } from '../../generated/schemas/variants/pure/ProductItem.pure';
import { ProductBrandSchema } from '../product-brand';
import { ProductMeasureSchema } from '../product-measure';
import { CurrencyCodeSchema } from '../../common/currency';
import type { Paginated } from '../../common/pagination';
import {
  createSyncChangePayloadSchema,
  createSyncFetchResponseSchema,
  createSyncSocketPayloadSchema,
  type SyncChangePayload,
  type SyncFetchResponse,
  type SyncSocketPayload,
} from '../sync';

export const ProductItemSchema = ProductItemModelSchema.omit({
  productCollection: true,
  productType: true,
  productBrand: true,
  productMeasure: true,
  country: true,
  barcodes: true,
  packages: true,
  shipments: true,
  stats: true,
  favorites: true,
}).extend({ updatedAt: z.string() });

export const ProductItemWithRelationsSchema = ProductItemSchema.extend({
  productBrand: ProductBrandSchema.nullable(),
  productMeasure: ProductMeasureSchema,
});

export const ProductItemStatsQuerySchema = z.object({
  productCollectionId: z.coerce.number().int().positive(),
  warehouseId: z.coerce.number().int().positive(),
});

export const ProductItemStatsFetchQuerySchema = z.object({
  warehouseId: z.coerce.number().int().positive(),
  productCollectionId: z.coerce.number().int().positive().optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export const ProductItemStatsSchema = z.object({
  id: z.number().int(),
  productItemId: z.number().int(),
  warehouseId: z.number().int(),
  quantity: z.string(),
  retailPrice: z.string().nullable(),
  currency: CurrencyCodeSchema.nullable(),
  updatedAt: z.string(),
});

export const ProductItemStatsFetchResponseSchema =
  createSyncFetchResponseSchema(ProductItemStatsSchema);
export const ProductItemStatsChangePayloadSchema =
  createSyncChangePayloadSchema(ProductItemStatsSchema);
export const ProductItemStatsSocketPayloadSchema =
  createSyncSocketPayloadSchema(ProductItemStatsSchema);

export const ProductItemFavoriteSchema = z.object({
  productItemId: z.number().int().positive(),
  createdAt: z.string(),
});

export const PRODUCT_ITEM_FAVORITE_CHANGED_EVENT = 'product-item-favorite:changed' as const;
export const ProductItemFavoriteChangeSchema = z.discriminatedUnion('isFavorite', [
  z.object({
    productItemId: z.number().int().positive(),
    isFavorite: z.literal(true),
    createdAt: z.string(),
  }),
  z.object({
    productItemId: z.number().int().positive(),
    isFavorite: z.literal(false),
    createdAt: z.null(),
  }),
]);

export type ProductItem = z.infer<typeof ProductItemSchema>;
export type ProductItemWithRelations = z.infer<typeof ProductItemWithRelationsSchema>;
export type ProductItemStatsQuery = z.infer<typeof ProductItemStatsQuerySchema>;
export type ProductItemStatsFetchQuery = z.infer<typeof ProductItemStatsFetchQuerySchema>;
export type ProductItemStats = z.infer<typeof ProductItemStatsSchema>;
export type ProductItemStatsFetchResponse = SyncFetchResponse<ProductItemStats>;
export type ProductItemStatsChangePayload = SyncChangePayload<ProductItemStats>;
export type ProductItemStatsSocketPayload = SyncSocketPayload<ProductItemStats>;
export type ProductItemFavorite = z.infer<typeof ProductItemFavoriteSchema>;
export type ProductItemFavoritePage = Paginated<ProductItemFavorite>;
export type ProductItemFavoriteChange = z.infer<typeof ProductItemFavoriteChangeSchema>;
