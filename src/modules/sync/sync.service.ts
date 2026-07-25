import { BadRequestException, Injectable } from '@nestjs/common';
import type { ProductItemStatsFetchQuery } from '@meerkapp/wms-contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PUBLIC_PRODUCT_ITEM_SELECT } from '../product-item/product-item.select';
import {
  cursorFromItems,
  encodeSyncCursor,
  parseSyncCursor,
  SyncCursorPosition,
} from './sync-cursor';
import { serializeSyncItems } from './sync-serializer';
import { getSyncTableDefinition, updatedAfterWhere } from './sync.registry';
import { SyncPullResponse } from './sync.types';

export { parseSyncCursor } from './sync-cursor';

const MAX_LIMIT = 5000;
const DEFAULT_FETCH_LIMIT = 5000;

export interface ProductItemsFetchQuery {
  id?: number;
  productCollectionId?: number | null;
  limit?: number;
}

export interface ProductBarcodesFetchQuery {
  code?: string;
  productItemId?: number;
  limit?: number;
}

export interface ProductShipmentsFetchQuery {
  warehouseId: number;
  productItemId?: number;
  limit?: number;
}

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async pull(
    table: string,
    cursor?: SyncCursorPosition,
    limit?: number,
  ): Promise<SyncPullResponse> {
    const definition = getSyncTableDefinition(table);
    const requestLimit = normalizeLimit(limit);
    const queryLimit = requestLimit === undefined ? undefined : requestLimit + 1;

    const rows = await definition.pull(this.prisma, {
      cursor,
      limit: queryLimit,
    });

    const hasMore = requestLimit !== undefined && rows.length > requestLimit;
    const pageRows = hasMore ? rows.slice(0, requestLimit) : rows;
    const serializedRows = serializeSyncItems(pageRows);
    const { items, deletedIds } = activeReadModelRows(table, serializedRows);
    // A composite timestamp/id cursor prevents page-boundary loss while the
    // longer-term revision/outbox cursor is not available yet.
    const nextCursor = cursorFromItems(serializedRows) ?? (cursor ? encodeSyncCursor(cursor) : null);

    return {
      items,
      ...(deletedIds.length > 0 ? { deletedIds } : {}),
      cursor: nextCursor,
      hasMore,
    };
  }

  async fetchProductItems(query: ProductItemsFetchQuery): Promise<SyncPullResponse> {
    const hasId = query.id !== undefined;
    const hasCollection = query.productCollectionId !== undefined;

    if (hasId === hasCollection) {
      throw new BadRequestException('Provide exactly one of id or productCollectionId');
    }

    const fetchLimit = normalizeLimit(query.limit) ?? DEFAULT_FETCH_LIMIT;
    const rows = await this.prisma.productItem.findMany({
      where: {
        archivedAt: null,
        ...(hasId ? { id: query.id } : { productCollectionId: query.productCollectionId }),
      },
      select: PUBLIC_PRODUCT_ITEM_SELECT,
      orderBy: hasId ? UPDATED_AT_ORDER : [{ sku: 'asc' }, { id: 'asc' }],
      take: fetchLimit + 1,
    });

    return this.buildFetchResponse(rows, fetchLimit);
  }

  async fetchProductBarcodes(query: ProductBarcodesFetchQuery): Promise<SyncPullResponse> {
    if (!query.code && query.productItemId === undefined) {
      throw new BadRequestException('Provide code or productItemId');
    }

    const fetchLimit = normalizeLimit(query.limit) ?? DEFAULT_FETCH_LIMIT;
    const rows = await this.prisma.productBarcode.findMany({
      where: {
        ...(query.code ? { code: query.code } : {}),
        ...(query.productItemId !== undefined ? { productItemId: query.productItemId } : {}),
        productItem: { archivedAt: null },
      },
      orderBy: UPDATED_AT_ORDER,
      take: fetchLimit + 1,
    });

    return this.buildFetchResponse(rows, fetchLimit);
  }

  async fetchProductShipments(query: ProductShipmentsFetchQuery): Promise<SyncPullResponse> {
    const fetchLimit = normalizeLimit(query.limit) ?? DEFAULT_FETCH_LIMIT;
    const rows = await this.prisma.productShipment.findMany({
      where: {
        warehouseId: query.warehouseId,
        ...(query.productItemId !== undefined ? { productItemId: query.productItemId } : {}),
        productItem: { archivedAt: null },
      },
      orderBy: UPDATED_AT_ORDER,
      take: fetchLimit + 1,
    });

    return this.buildFetchResponse(rows, fetchLimit);
  }

  async fetchProductItemStats(query: ProductItemStatsFetchQuery): Promise<SyncPullResponse> {
    const fetchLimit = normalizeLimit(query.limit) ?? DEFAULT_FETCH_LIMIT;
    const cursor = parseSyncCursor(query.cursor);
    const rows = await this.prisma.productItemStats.findMany({
      where: {
        warehouseId: query.warehouseId,
        productItem: {
          archivedAt: null,
          ...(query.productCollectionId === undefined
            ? {}
            : { productCollectionId: query.productCollectionId }),
        },
        ...updatedAfterWhere(cursor),
      },
      orderBy: UPDATED_AT_ORDER,
      take: fetchLimit + 1,
    });

    return this.buildFetchResponse(rows, fetchLimit, cursor);
  }

  private buildFetchResponse(
    rows: unknown[],
    limit: number,
    cursor?: SyncCursorPosition,
  ): SyncPullResponse {
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = serializeSyncItems(pageRows);

    return {
      items,
      cursor: cursorFromItems(items) ?? (cursor ? encodeSyncCursor(cursor) : null),
      hasMore,
    };
  }
}

export function parseSyncLimit(raw?: string | number | null): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException('limit must be a positive integer');
  }
  return normalizeLimit(value);
}

function normalizeLimit(limit?: number): number | undefined {
  if (limit === undefined) return undefined;
  return Math.min(limit, MAX_LIMIT);
}

const UPDATED_AT_ORDER = [{ updatedAt: 'asc' as const }, { id: 'asc' as const }];

function activeReadModelRows(
  table: string,
  rows: unknown[],
): { items: unknown[]; deletedIds: number[] } {
  if (table !== 'product_item') return { items: rows, deletedIds: [] };

  const items: unknown[] = [];
  const deletedIds: number[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const productItem = row as { id?: unknown; archivedAt?: unknown };
    if (productItem.archivedAt === null || productItem.archivedAt === undefined) items.push(row);
    else if (typeof productItem.id === 'number') deletedIds.push(productItem.id);
  }
  return { items, deletedIds };
}

export function parseOptionalPositiveInt(
  raw: string | number | undefined | null,
  field: string,
): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  return parseRequiredPositiveInt(raw, field);
}

export function parseRequiredPositiveInt(
  raw: string | number | undefined | null,
  field: string,
): number {
  if (raw === undefined || raw === null || raw === '') {
    throw new BadRequestException(`${field} is required`);
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }
  return value;
}

export function parseOptionalNullablePositiveInt(
  raw: string | number | undefined | null,
  field: string,
): number | null | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (raw === null || raw === 'null') return null;
  return parseRequiredPositiveInt(raw, field);
}
