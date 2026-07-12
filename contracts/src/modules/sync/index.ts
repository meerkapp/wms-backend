import { z } from 'zod';

export const SYNC_TABLE_NAMES = [
  'country',
  'locality',
  'organization',
  'warehouse',
  'folder',
  'product_collection',
  'product_type',
  'product_brand',
  'product_measure',
  'product_package',
  'product_shipment',
  'product_item',
  'product_barcode',
  'product_item_stats',
] as const;

export const SyncTableNameSchema = z.enum(SYNC_TABLE_NAMES);
export const SyncCursorSchema = z.union([z.string(), z.number(), z.null()]);
export const SyncEntityIdSchema = z.union([z.string(), z.number()]);

export function createSyncFetchResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    cursor: SyncCursorSchema,
    hasMore: z.boolean(),
  });
}

export function createSyncChangePayloadSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  const ids = z.array(SyncEntityIdSchema);
  return z.object({
    added: z.array(itemSchema).optional(),
    modified: z.array(itemSchema).optional(),
    removed: ids.optional(),
    upserted: z.array(itemSchema).optional(),
    deletedIds: ids.optional(),
    deleted: ids.optional(),
    cursor: SyncCursorSchema.optional(),
  });
}

export function createSyncSocketPayloadSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  const ids = z.array(SyncEntityIdSchema);
  return z.object({
    added: z.array(itemSchema),
    modified: z.array(itemSchema),
    removed: ids,
    upserted: z.array(itemSchema),
    deletedIds: ids,
    deleted: ids,
    cursor: SyncCursorSchema,
  });
}

export type SyncTableName = z.infer<typeof SyncTableNameSchema>;
export type SyncCursor = z.infer<typeof SyncCursorSchema>;
export type SyncEntityId = z.infer<typeof SyncEntityIdSchema>;

export interface SyncFetchResponse<T = unknown> {
  items: T[];
  cursor: SyncCursor;
  hasMore: boolean;
}

export type SyncPullResponse<T = unknown> = SyncFetchResponse<T>;

export interface SyncChangePayload<T = unknown> {
  added?: T[];
  modified?: T[];
  removed?: SyncEntityId[];
  upserted?: T[];
  deletedIds?: SyncEntityId[];
  deleted?: SyncEntityId[];
  cursor?: SyncCursor;
}

export interface SyncSocketPayload<T = unknown> {
  added: T[];
  modified: T[];
  removed: SyncEntityId[];
  upserted: T[];
  deletedIds: SyncEntityId[];
  deleted: SyncEntityId[];
  cursor: SyncCursor;
}
