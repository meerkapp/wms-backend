import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

export interface SyncChanges<T = unknown> {
  added: T[];
  modified: T[];
  removed: T[];
}

@WebSocketGateway({ cors: { origin: process.env.FRONT_END_DOMAIN } })
export class SyncGateway {
  @WebSocketServer()
  declare server: Server;

  notifyChange<T>(table: string, changes: Partial<SyncChanges<T>>): void {
    this.server.emit(`sync:${table}`, {
      added: changes.added ?? [],
      modified: changes.modified ?? [],
      removed: changes.removed ?? [],
    });
  }
}
