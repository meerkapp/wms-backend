import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { SyncEventScope, SyncSocketPayload, SyncTableName } from './sync.types';

@WebSocketGateway({ cors: { origin: process.env.FRONT_END_DOMAIN } })
export class SyncGateway implements OnGatewayConnection {
  @WebSocketServer()
  declare server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    const payload = this.authenticate(socket);
    if (!payload) {
      socket.disconnect();
      return;
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        isActive: true,
        warehouseId: true,
        warehouse: { select: { organizationId: true } },
      },
    });

    if (!employee?.isActive) {
      socket.disconnect();
      return;
    }

    socket.data.userId = employee.id;
    socket.data.warehouseId = employee.warehouseId;
    socket.data.organizationId = employee.warehouse?.organizationId ?? null;

    await socket.join(this.authenticatedRoom());
    await socket.join(this.userRoom(employee.id));
    if (employee.warehouseId) {
      await socket.join(this.warehouseRoom(employee.warehouseId));
    }
    if (employee.warehouse?.organizationId) {
      await socket.join(this.organizationRoom(employee.warehouse.organizationId));
    }
  }

  emitTableChange<T>(
    tableName: SyncTableName,
    payload: SyncSocketPayload<T>,
    scope?: SyncEventScope,
  ): void {
    const event = `sync:${tableName}`;
    const rooms = this.roomsForScope(scope);

    if (rooms.length > 0) {
      this.server.to(rooms).emit(event, payload);
      return;
    }

    this.server.to(this.authenticatedRoom()).emit(event, payload);
  }

  emitUserEvent<T>(event: string, userId: string, payload: T): void {
    this.server.to(this.userRoom(userId)).emit(event, payload);
  }

  private authenticate(socket: Socket): JwtPayload | null {
    const authToken = socket.handshake.auth?.token as string | undefined;
    const headerToken = this.extractBearerToken(socket.handshake.headers.authorization);
    const token = authToken ?? headerToken;
    if (!token) return null;

    try {
      return this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      return null;
    }
  }

  private extractBearerToken(header: string | string[] | undefined): string | undefined {
    const value = Array.isArray(header) ? header[0] : header;
    if (!value?.startsWith('Bearer ')) return undefined;
    return value.slice('Bearer '.length);
  }

  private roomsForScope(scope?: SyncEventScope): string[] {
    if (!scope) return [];

    return [
      scope.userId ? this.userRoom(scope.userId) : null,
      scope.organizationId ? this.organizationRoom(scope.organizationId) : null,
      scope.warehouseId ? this.warehouseRoom(scope.warehouseId) : null,
    ].filter((room): room is string => room !== null);
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  private authenticatedRoom(): string {
    return 'authenticated';
  }

  private organizationRoom(organizationId: number): string {
    return `organization:${organizationId}`;
  }

  private warehouseRoom(warehouseId: number): string {
    return `warehouse:${warehouseId}`;
  }
}
