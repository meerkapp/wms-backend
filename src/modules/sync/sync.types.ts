export type {
  SyncChangePayload,
  SyncCursor,
  SyncEntityId,
  SyncPullResponse,
  SyncSocketPayload,
  SyncTableName,
} from '@meerkapp/wms-contracts';

export interface SyncEventScope {
  userId?: string;
  organizationId?: number;
  warehouseId?: number;
}
