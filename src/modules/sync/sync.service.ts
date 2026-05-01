import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { mingoToPrisma } from '../../common/mingo/mingo-to-prisma';
import { PrismaService } from '../../common/prisma/prisma.service';

export const SYNC_TABLES: (keyof PrismaClient)[] = [
  'country',
  'locality',
  'organization',
  'warehouse',
  'productType',
  'folder',
  'productCollection',
  'productMeasure',
  'productBrand',
  'productItem',
  'productShipment',
  'productBarcode',
  'productPackage',
];

export const FETCH_TABLES: (keyof PrismaClient)[] = ['productItem', 'productShipment'];

export interface SyncResult<T = unknown> {
  items: T[];
}

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async pull(table: string, since?: Date): Promise<SyncResult> {
    const syncTable = SYNC_TABLES.find((t) => t === table);
    if (!syncTable) throw new BadRequestException(`Table ${table} does not support sync`);

    const where = since ? { updatedAt: { gt: since } } : {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = await (this.prisma[syncTable] as any).findMany({ where });
    return { items };
  }

  async fetch(table: string, selector: Record<string, unknown>): Promise<SyncResult> {
    const fetchTable = FETCH_TABLES.find((t) => t === table);
    if (!fetchTable) throw new BadRequestException(`Table ${table} does not support fetch`);

    const where = mingoToPrisma(selector);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = await (this.prisma[fetchTable] as any).findMany({ where });
    return { items };
  }
}
