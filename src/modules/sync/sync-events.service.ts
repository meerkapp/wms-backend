import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { cursorFromItems } from './sync-cursor';
import { serializeSyncItems } from './sync-serializer';
import { getEventTableDefinition, isSyncTableName } from './sync.registry';
import { SyncGateway } from './sync.gateway';
import { SyncChangePayload, SyncEntityId, SyncEventScope, SyncTableName } from './sync.types';

@Injectable()
export class SyncEventsService {
  private readonly logger = new Logger(SyncEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncGateway: SyncGateway,
  ) {}

  emitTableChange<T>(
    tableName: SyncTableName,
    changes: SyncChangePayload<T>,
    scope?: SyncEventScope,
  ): void {
    const added = serializeSyncItems(changes.added ?? []);
    const modified = serializeSyncItems(changes.modified ?? []);
    const removed = changes.removed ?? [];
    const cursor = changes.cursor ?? cursorFromItems([...added, ...modified]);

    this.syncGateway.emitTableChange(
      tableName,
      {
        added,
        modified,
        removed,
        upserted: [...added, ...modified],
        deletedIds: removed,
        deleted: removed,
        // A physical delete has no updatedAt value. Advancing a timestamp
        // cursor to "now" here could skip older rows still waiting in a pull.
        // The client applies removed ids live without advancing in this case.
        cursor: cursor ?? null,
      },
      scope,
    );
  }

  async emitTableIds(
    tableName: string,
    changes: {
      addedIds?: SyncEntityId[];
      modifiedIds?: SyncEntityId[];
      removedIds?: SyncEntityId[];
    },
  ): Promise<void> {
    const definition = getEventTableDefinition(tableName);
    if (!definition?.findByIds) {
      this.logger.warn(`Ignoring DB change for unsupported table: ${tableName}`);
      return;
    }

    const [added, modified] = await Promise.all([
      changes.addedIds?.length ? definition.findByIds(this.prisma, changes.addedIds) : [],
      changes.modifiedIds?.length ? definition.findByIds(this.prisma, changes.modifiedIds) : [],
    ]);

    const removed = changes.removedIds ?? [];

    if (!isSyncTableName(tableName)) {
      return;
    }

    // All current sync read-model tables are shared across the authenticated
    // operational space. Private events may still call emitTableChange with a scope.
    this.emitTableChange<unknown>(tableName, { added, modified, removed });
  }
}
