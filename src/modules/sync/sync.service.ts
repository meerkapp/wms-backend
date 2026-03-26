import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export type SyncTable = 'warehouse' | 'organization' | 'locality' | 'country';

export interface SyncResult<T = unknown> {
  items: T[];
}

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async pull(table: SyncTable, since?: Date): Promise<SyncResult> {
    const where = since ? { updatedAt: { gt: since } } : {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = await (this.prisma[table] as any).findMany({ where });
    return { items };
  }
}
