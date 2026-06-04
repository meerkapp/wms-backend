import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { mingoToPrisma } from '../../common/mingo/mingo-to-prisma';
import { PrismaService } from '../../common/prisma/prisma.service';

export const SYNC_MODELS: (keyof PrismaClient)[] = [
  'country',
  'locality',
  'organization',
  'warehouse',
  'productType',
  'folder',
  'productCollection',
  'productMeasure',
  'productBrand',
  'productShipment',
  'productBarcode',
  'productPackage',
];

export const FETCH_MODELS: (keyof PrismaClient)[] = [
  'productShipment',
  'productItem',
  'productItemStats',
];

export interface SyncResult<T = unknown> {
  items: T[];
}

export interface FetchHandler {
  fetch(selector: Record<string, unknown>): Promise<SyncResult>;
}

@Injectable()
export class SyncService {
  private fetchHandlers = new Map<string, FetchHandler>();

  registerFetchHandler(model: string, handler: FetchHandler): void {
    this.fetchHandlers.set(model, handler);
  }

  constructor(private readonly prisma: PrismaService) {}

  async pull(model: string, since?: Date): Promise<SyncResult> {
    const syncModel = SYNC_MODELS.find((t) => t === model);
    if (!syncModel) throw new BadRequestException(`Model ${model} does not support sync`);

    const where = since ? { updatedAt: { gt: since } } : {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = await (this.prisma[syncModel] as any).findMany({ where });
    return { items };
  }

  async fetch(model: string, selector: Record<string, unknown>): Promise<SyncResult> {
    const fetchModel = FETCH_MODELS.find((t) => t === model);
    if (!fetchModel) throw new BadRequestException(`Model ${model} does not support fetch`);

    const customHandler = this.fetchHandlers.get(model);
    if (customHandler) return customHandler.fetch(selector);

    const where = mingoToPrisma(selector);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = await (this.prisma[fetchModel] as any).findMany({ where });
    return { items };
  }
}
