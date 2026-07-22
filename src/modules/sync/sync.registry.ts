import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SyncCursorPosition } from './sync-cursor';
import { SyncEntityId, SyncTableName } from './sync.types';

const UPDATED_AT_ORDER = [{ updatedAt: 'asc' as const }, { id: 'asc' as const }];

export interface PullOptions {
  cursor?: SyncCursorPosition;
  limit?: number;
}

export interface SyncTableDefinition {
  tableName: SyncTableName;
  pull(prisma: PrismaService, options: PullOptions): Promise<unknown[]>;
  findByIds(prisma: PrismaService, ids: SyncEntityId[]): Promise<unknown[]>;
}

export function updatedAfterWhere(
  cursor?: SyncCursorPosition,
): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  return {
    OR: [
      { updatedAt: { gt: cursor.updatedAt } },
      { updatedAt: cursor.updatedAt, id: { gt: cursor.id } },
    ],
  };
}

function withTake(limit?: number): { take?: number } {
  return limit === undefined ? {} : { take: limit };
}

function numericIds(ids: SyncEntityId[]): number[] {
  return ids.filter((id): id is number => typeof id === 'number');
}

function byIdsWhere(ids: SyncEntityId[]): { id: { in: number[] } } {
  return { id: { in: numericIds(ids) } };
}

export const SYNC_TABLES = {
  country: {
    tableName: 'country',
    pull: (prisma, options) =>
      prisma.country.findMany({
        where: updatedAfterWhere(options.cursor),
        orderBy: UPDATED_AT_ORDER,
        ...withTake(options.limit),
      }),
    findByIds: (prisma, ids) =>
      prisma.country.findMany({ where: byIdsWhere(ids), orderBy: UPDATED_AT_ORDER }),
  },
  locality: {
    tableName: 'locality',
    pull: (prisma, options) =>
      prisma.locality.findMany({
        where: updatedAfterWhere(options.cursor),
        orderBy: UPDATED_AT_ORDER,
        ...withTake(options.limit),
      }),
    findByIds: (prisma, ids) =>
      prisma.locality.findMany({ where: byIdsWhere(ids), orderBy: UPDATED_AT_ORDER }),
  },
  organization: {
    tableName: 'organization',
    pull: (prisma, options) =>
      prisma.organization.findMany({
        where: updatedAfterWhere(options.cursor),
        orderBy: UPDATED_AT_ORDER,
        ...withTake(options.limit),
      }),
    findByIds: (prisma, ids) =>
      prisma.organization.findMany({ where: byIdsWhere(ids), orderBy: UPDATED_AT_ORDER }),
  },
  warehouse: {
    tableName: 'warehouse',
    pull: (prisma, options) =>
      prisma.warehouse.findMany({
        where: updatedAfterWhere(options.cursor),
        orderBy: UPDATED_AT_ORDER,
        ...withTake(options.limit),
      }),
    findByIds: (prisma, ids) =>
      prisma.warehouse.findMany({ where: byIdsWhere(ids), orderBy: UPDATED_AT_ORDER }),
  },
  folder: {
    tableName: 'folder',
    pull: (prisma, options) =>
      prisma.folder.findMany({
        where: updatedAfterWhere(options.cursor),
        orderBy: UPDATED_AT_ORDER,
        ...withTake(options.limit),
      }),
    findByIds: (prisma, ids) =>
      prisma.folder.findMany({ where: byIdsWhere(ids), orderBy: UPDATED_AT_ORDER }),
  },
  product_collection: {
    tableName: 'product_collection',
    pull: (prisma, options) =>
      prisma.productCollection.findMany({
        where: updatedAfterWhere(options.cursor),
        orderBy: UPDATED_AT_ORDER,
        ...withTake(options.limit),
      }),
    findByIds: (prisma, ids) =>
      prisma.productCollection.findMany({ where: byIdsWhere(ids), orderBy: UPDATED_AT_ORDER }),
  },
  product_type: {
    tableName: 'product_type',
    pull: (prisma, options) =>
      prisma.productType.findMany({
        where: updatedAfterWhere(options.cursor),
        orderBy: UPDATED_AT_ORDER,
        ...withTake(options.limit),
      }),
    findByIds: (prisma, ids) =>
      prisma.productType.findMany({ where: byIdsWhere(ids), orderBy: UPDATED_AT_ORDER }),
  },
  product_brand: {
    tableName: 'product_brand',
    pull: (prisma, options) =>
      prisma.productBrand.findMany({
        where: updatedAfterWhere(options.cursor),
        orderBy: UPDATED_AT_ORDER,
        ...withTake(options.limit),
      }),
    findByIds: (prisma, ids) =>
      prisma.productBrand.findMany({ where: byIdsWhere(ids), orderBy: UPDATED_AT_ORDER }),
  },
  product_measure: {
    tableName: 'product_measure',
    pull: (prisma, options) =>
      prisma.productMeasure.findMany({
        where: updatedAfterWhere(options.cursor),
        orderBy: UPDATED_AT_ORDER,
        ...withTake(options.limit),
      }),
    findByIds: (prisma, ids) =>
      prisma.productMeasure.findMany({ where: byIdsWhere(ids), orderBy: UPDATED_AT_ORDER }),
  },
  product_package: {
    tableName: 'product_package',
    pull: (prisma, options) =>
      prisma.productPackage.findMany({
        where: {
          productItem: { archivedAt: null },
          ...updatedAfterWhere(options.cursor),
        },
        orderBy: UPDATED_AT_ORDER,
        ...withTake(options.limit),
      }),
    findByIds: (prisma, ids) =>
      prisma.productPackage.findMany({
        where: { ...byIdsWhere(ids), productItem: { archivedAt: null } },
        orderBy: UPDATED_AT_ORDER,
      }),
  },
  product_shipment: {
    tableName: 'product_shipment',
    pull: (prisma, options) =>
      prisma.productShipment.findMany({
        where: {
          productItem: { archivedAt: null },
          ...updatedAfterWhere(options.cursor),
        },
        orderBy: UPDATED_AT_ORDER,
        ...withTake(options.limit),
      }),
    findByIds: (prisma, ids) =>
      prisma.productShipment.findMany({
        where: { ...byIdsWhere(ids), productItem: { archivedAt: null } },
        orderBy: UPDATED_AT_ORDER,
      }),
  },
  product_item: {
    tableName: 'product_item',
    pull: (prisma, options) =>
      prisma.productItem.findMany({
        where: updatedAfterWhere(options.cursor),
        orderBy: UPDATED_AT_ORDER,
        include: { productBrand: true, productMeasure: true },
        ...withTake(options.limit),
      }),
    findByIds: (prisma, ids) =>
      prisma.productItem.findMany({
        where: byIdsWhere(ids),
        orderBy: UPDATED_AT_ORDER,
        include: { productBrand: true, productMeasure: true },
      }),
  },
  product_item_stats: {
    tableName: 'product_item_stats',
    pull: (prisma, options) =>
      prisma.productItemStats.findMany({
        where: {
          productItem: { archivedAt: null },
          ...updatedAfterWhere(options.cursor),
        },
        orderBy: UPDATED_AT_ORDER,
        ...withTake(options.limit),
      }),
    findByIds: (prisma, ids) =>
      prisma.productItemStats.findMany({
        where: { ...byIdsWhere(ids), productItem: { archivedAt: null } },
        orderBy: UPDATED_AT_ORDER,
      }),
  },
  product_barcode: {
    tableName: 'product_barcode',
    pull: (prisma, options) =>
      prisma.productBarcode.findMany({
        where: {
          productItem: { archivedAt: null },
          ...updatedAfterWhere(options.cursor),
        },
        orderBy: UPDATED_AT_ORDER,
        ...withTake(options.limit),
      }),
    findByIds: (prisma, ids) =>
      prisma.productBarcode.findMany({
        where: { ...byIdsWhere(ids), productItem: { archivedAt: null } },
        orderBy: UPDATED_AT_ORDER,
      }),
  },
} satisfies Record<SyncTableName, SyncTableDefinition>;

export const SYNC_TABLE_NAMES = Object.keys(SYNC_TABLES) as SyncTableName[];

export function isSyncTableName(table: string): table is SyncTableName {
  return table in SYNC_TABLES;
}

export function getSyncTableDefinition(table: string): SyncTableDefinition {
  if (!isSyncTableName(table)) {
    throw new BadRequestException(`Table ${table} does not support sync`);
  }
  return SYNC_TABLES[table];
}

export function getEventTableDefinition(table: string): SyncTableDefinition | undefined {
  if (isSyncTableName(table)) return SYNC_TABLES[table];
  return undefined;
}
