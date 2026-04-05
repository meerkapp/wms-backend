import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PresenceService } from './presence.service';

// Authenticate via handshake auth: io(url, { auth: { token } })
// Heartbeat event extends online TTL, emit every ~2 min

@WebSocketGateway({ cors: { origin: process.env.FRONT_END_DOMAIN } })
export class PresenceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  declare server: Server;

  // userId -> socketIds (multiple tabs support)
  private readonly userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly presenceService: PresenceService,
  ) {}

  private authenticate(socket: Socket): JwtPayload | null {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return null;
    try {
      return this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      return null;
    }
  }

  async handleConnection(socket: Socket): Promise<void> {
    const payload = this.authenticate(socket);
    if (!payload) {
      socket.disconnect();
      return;
    }

    const userId = payload.sub;
    socket.data.userId = userId;

    const isFirstSocket = !this.userSockets.has(userId);
    if (isFirstSocket) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socket.id);

    if (isFirstSocket) {
      await this.presenceService.setOnline(userId);
      this.notifyAll({ employeeId: userId, status: 'online' });
    }

    // Send current online list to the newly connected client
    socket.emit('presence:list', [...this.userSockets.keys()]);
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const userId = socket.data.userId as string | undefined;
    if (!userId) return;

    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
        const lastSeen = await this.presenceService.setOffline(userId);
        if (lastSeen) {
          this.notifyAll({ employeeId: userId, status: 'offline', lastSeen: lastSeen.toISOString() });
        }
      }
    }
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(socket: Socket): Promise<void> {
    const userId = socket.data.userId as string | undefined;
    if (userId) {
      await this.presenceService.extendOnline(userId);
    }
  }

  notifyAll(data: { employeeId: string; status: 'online' | 'offline'; lastSeen?: string }): void {
    this.server.emit('employee:status', data);
  }
}
