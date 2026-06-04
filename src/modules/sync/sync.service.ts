import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { mingoToPrisma } from '../../common/mingo/mingo-to-prisma';
import { PrismaService } from '../../common/prisma/prisma.service';

export const SYNC_MODELS: Record<string, keyof PrismaClient> = {
  country: 'country',
  locality: 'locality',
  organization: 'organization',
  warehouse: 'warehouse',
  product_type: 'productType',
  folder: 'folder',
  product_collection: 'productCollection',
  product_measure: 'productMeasure',
  product_brand: 'productBrand',
  product_shipment: 'productShipment',
  product_barcode: 'productBarcode',
  product_package: 'productPackage',
};

export const FETCH_MODELS: Record<string, keyof PrismaClient> = {
  product_shipment: 'productShipment',
  product_item: 'productItem',
  product_item_stats: 'productItemStats',
};

export interface SyncResult<T = unknown> {
  items: T[];
}

export interface FetchHandler {
  fetch(selector: Record<string, unknown>): Promise<SyncResult>;
}

@Injectable()
export class SyncService {
  private fetchHandlers = new Map<string, FetchHandler>();

  registerFetchHandler(table: string, handler: FetchHandler): void {
    this.fetchHandlers.set(table, handler);
  }

  constructor(private readonly prisma: PrismaService) {}

  async pull(table: string, since?: Date): Promise<SyncResult> {
    const model = SYNC_MODELS[table];
    if (!model) throw new BadRequestException(`Table ${table} does not support sync`);

    const where = since ? { updatedAt: { gt: since } } : {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = await (this.prisma[model] as any).findMany({ where });
    return { items };
  }

  async fetch(table: string, selector: Record<string, unknown>): Promise<SyncResult> {
    const model = FETCH_MODELS[table];
    if (!model) throw new BadRequestException(`Table ${table} does not support fetch`);

    const customHandler = this.fetchHandlers.get(table);
    if (customHandler) return customHandler.fetch(selector);

    const where = mingoToPrisma(selector);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = await (this.prisma[model] as any).findMany({ where });
    return { items };
  }
}
