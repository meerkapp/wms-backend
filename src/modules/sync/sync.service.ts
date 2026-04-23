import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export const SYNC_TABLE_MAP: Record<string, keyof PrismaClient> = {
  country: 'country',
  locality: 'locality',
  organization: 'organization',
  warehouse: 'warehouse',
  product_type: 'productType',
};

export interface SyncResult<T = unknown> {
  items: T[];
}

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async pull(table: string, since?: Date): Promise<SyncResult> {
    const accessor = SYNC_TABLE_MAP[table];
    const where = since ? { updatedAt: { gt: since } } : {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = await (this.prisma[accessor] as any).findMany({ where });
    return { items };
  }
}
