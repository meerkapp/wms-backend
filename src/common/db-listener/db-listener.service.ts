import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Notification } from 'pg';
import { SyncGateway } from '../../modules/sync/sync.gateway';
import { FETCH_MODELS, SYNC_MODELS } from '../../modules/sync/sync.service';

interface DbChangePayload {
  table: string;
  op: 'insert' | 'update' | 'delete';
  id: number;
}

const SYNC_TABLES = new Set([...Object.keys(SYNC_MODELS), ...Object.keys(FETCH_MODELS)]);

@Injectable()
export class DbListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbListenerService.name);
  private client!: Client;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private readonly RECONNECT_DELAY_MS = 3000;

  private pendingChanges = new Map<
    string,
    { added: Set<number>; modified: Set<number>; removed: Set<number> }
  >();
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly FLUSH_DELAY_MS = 50;

  constructor(
    private readonly configService: ConfigService,
    private readonly syncGateway: SyncGateway,
  ) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.flush();
    if (this.client) await this.client.end();
  }

  private async connect() {
    const connectionString = this.configService.get<string>('DATABASE_URL');
    if (!connectionString) {
      this.logger.error('DATABASE_URL is not set, DB listener disabled');
      return;
    }

    this.client = new Client({ connectionString });

    this.client.on('notification', (msg: Notification) => {
      if (msg.channel !== 'db_change' || !msg.payload) return;

      try {
        const payload: DbChangePayload = JSON.parse(msg.payload);
        this.handleNotification(payload);
      } catch {
        this.logger.warn(`Failed to parse notification payload: ${msg.payload}`);
      }
    });

    this.client.on('error', (err: Error) => {
      this.logger.error(`DB listener connection error: ${err.message}`);
      this.scheduleReconnect();
    });

    this.client.on('end', () => {
      this.logger.warn('DB listener connection closed');
      this.scheduleReconnect();
    });

    try {
      await this.client.connect();
      await this.client.query('LISTEN db_change');
      this.logger.log('DB listener connected and listening on "db_change"');
    } catch (err) {
      this.logger.error(`Failed to connect DB listener: ${(err as Error).message}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.isShuttingDown || this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.logger.log('Attempting to reconnect DB listener...');
      try {
        if (this.client) {
          this.client.removeAllListeners();
          try {
            await this.client.end();
          } catch (err) {
            this.logger.warn(
              `Failed to close stale DB listener connection: ${(err as Error).message}`,
            );
          }
        }
        await this.connect();
      } catch {
        this.scheduleReconnect();
      }
    }, this.RECONNECT_DELAY_MS);
  }

  private handleNotification(payload: DbChangePayload) {
    const { table, op, id } = payload;

    if (!SYNC_TABLES.has(table)) {
      this.logger.warn(`Ignoring DB change for unsupported table: ${table}`);
      return;
    }

    let changes = this.pendingChanges.get(table);
    if (!changes) {
      changes = { added: new Set(), modified: new Set(), removed: new Set() };
      this.pendingChanges.set(table, changes);
    }

    if (op === 'insert') changes.added.add(id);
    else if (op === 'update') changes.modified.add(id);
    else if (op === 'delete') changes.removed.add(id);

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, this.FLUSH_DELAY_MS);
    }
  }

  private flush() {
    for (const [table, changes] of this.pendingChanges) {
      this.syncGateway.notifyChange(table, {
        added: [...changes.added].map((id) => ({ id })),
        modified: [...changes.modified].map((id) => ({ id })),
        removed: [...changes.removed].map((id) => ({ id })),
      });
    }
    this.pendingChanges.clear();
  }
}
