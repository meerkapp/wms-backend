import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import {
  DEVICE_SESSION_COOKIE,
  DEVICE_SESSION_TTL_MS,
  DeviceSessionService,
} from './device-session.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

const LEGACY_REFRESH_COOKIE = 'refresh_token';

export interface EmployeeTokenData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  warehouseId: number | null;
  isActive: boolean;
  lastSeen: Date | null;
}

export interface AuthSessionResult {
  access_token: string;
  deviceSessionId: string;
}

export interface DeviceAccountSummary {
  accountId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  warehouseId: number | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly deviceSessionService: DeviceSessionService,
  ) {}

  async login(dto: LoginDto, deviceSessionId?: string): Promise<AuthSessionResult> {
    const employee = await this.findEmployeeWithPermissions({ email: dto.email });

    if (!employee) throw new UnauthorizedException('Invalid credentials');
    if (!(await bcrypt.compare(dto.password, employee.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!employee.isActive) throw new UnauthorizedException('Account is inactive');

    const lastSeen = new Date();
    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { lastSeen },
    });
    employee.lastSeen = lastSeen;

    return this.createAuthenticatedSession(
      employee,
      this.extractPermissions(employee),
      deviceSessionId,
    );
  }

  async createAuthenticatedSession(
    employee: EmployeeTokenData,
    permissions: string[],
    deviceSessionId?: string,
  ): Promise<AuthSessionResult> {
    const resolvedSessionId = await this.deviceSessionService.rotateAndAddAccount(
      deviceSessionId,
      employee.id,
    );
    return {
      access_token: this.issueAccessToken(employee, permissions),
      deviceSessionId: resolvedSessionId,
    };
  }

  async activateAccount(deviceSessionId: string, accountId: string): Promise<AuthSessionResult> {
    if (!(await this.deviceSessionService.hasAccount(deviceSessionId, accountId))) {
      throw new UnauthorizedException('Account is not authorized on this device');
    }

    const employee = await this.findEmployeeWithPermissions({ id: accountId });
    if (!employee?.isActive) {
      await this.deviceSessionService.removeAccount(deviceSessionId, accountId);
      throw new UnauthorizedException(employee ? 'Account is inactive' : 'Employee not found');
    }

    if (!(await this.deviceSessionService.touchAccount(deviceSessionId, accountId))) {
      throw new UnauthorizedException('Account is no longer authorized on this device');
    }
    return {
      access_token: this.issueAccessToken(employee, this.extractPermissions(employee)),
      deviceSessionId,
    };
  }

  async listDeviceAccounts(deviceSessionId: string): Promise<DeviceAccountSummary[]> {
    const accountIds = await this.deviceSessionService.listAccountIds(deviceSessionId);
    if (accountIds.length === 0) return [];

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: accountIds }, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        warehouseId: true,
      },
    });
    const activeIds = new Set(employees.map((employee) => employee.id));
    await Promise.all(
      accountIds
        .filter((accountId) => !activeIds.has(accountId))
        .map((accountId) => this.deviceSessionService.removeAccount(deviceSessionId, accountId)),
    );

    return employees
      .map((employee) => ({
        accountId: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        avatarUrl: employee.avatarUrl,
        warehouseId: employee.warehouseId,
      }))
      .sort((left, right) =>
        `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`),
      );
  }

  removeDeviceAccount(deviceSessionId: string, accountId: string): Promise<number> {
    return this.deviceSessionService.removeAccount(deviceSessionId, accountId);
  }

  async migrateLegacyRefreshToken(
    refreshToken: string,
    requestedAccountId: string,
  ): Promise<AuthSessionResult> {
    let payload: { sub: string; jti: string };
    try {
      payload = this.jwtService.verify<{ sub: string; jti: string }>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.sub !== requestedAccountId) {
      throw new UnauthorizedException('Refresh token belongs to another account');
    }

    const key = `refresh:${payload.sub}:${payload.jti}`;
    if ((await this.redisService.del(key)) !== 1) {
      throw new UnauthorizedException('Refresh token expired or already used');
    }

    const employee = await this.findEmployeeWithPermissions({ id: payload.sub });
    if (!employee?.isActive) {
      throw new UnauthorizedException(employee ? 'Account is inactive' : 'Employee not found');
    }

    return this.createAuthenticatedSession(employee, this.extractPermissions(employee));
  }

  async revokeLegacyRefreshToken(refreshToken: string): Promise<void> {
    let payload: { sub?: string; jti?: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      return;
    }

    if (payload?.sub && payload.jti) {
      await this.redisService.del(`refresh:${payload.sub}:${payload.jti}`);
    }
  }

  setDeviceSessionCookie(res: Response, sessionId: string): void {
    res.cookie(DEVICE_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: this.configService.get('COOKIE_SECURE') === 'true',
      sameSite: 'lax',
      maxAge: DEVICE_SESSION_TTL_MS,
      path: '/api/auth',
    });
  }

  clearDeviceSessionCookie(res: Response): void {
    res.clearCookie(DEVICE_SESSION_COOKIE, { path: '/api/auth' });
  }

  clearLegacyRefreshCookie(res: Response): void {
    res.clearCookie(LEGACY_REFRESH_COOKIE, { path: '/api/auth' });
  }

  private issueAccessToken(employee: EmployeeTokenData, permissions: string[]): string {
    const payload: JwtPayload = {
      sub: employee.id,
      email: employee.email,
      firstName: employee.firstName,
      lastName: employee.lastName,
      avatarUrl: employee.avatarUrl,
      warehouseId: employee.warehouseId,
      isActive: employee.isActive,
      permissions,
      lastSeen: employee.lastSeen?.toISOString() ?? null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.jwtService.sign(payload as any, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN'),
    });
  }

  private findEmployeeWithPermissions(where: Prisma.EmployeeWhereUniqueInput) {
    return this.prisma.employee.findUnique({
      where,
      include: {
        roleAssignments: {
          include: {
            employeeRole: {
              include: {
                permissions: {
                  include: { employeePermission: true },
                },
              },
            },
          },
        },
      },
    });
  }

  private extractPermissions(employee: {
    roleAssignments: Array<{
      employeeRole: {
        permissions: Array<{
          employeePermission: { name: string };
        }>;
      };
    }>;
  }): string[] {
    const permissionSet = new Set<string>();
    for (const assignment of employee.roleAssignments) {
      for (const rolePermission of assignment.employeeRole.permissions) {
        permissionSet.add(rolePermission.employeePermission.name);
      }
    }
    return Array.from(permissionSet);
  }
}
