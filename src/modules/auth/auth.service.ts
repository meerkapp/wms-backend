import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;
const REFRESH_TTL_MS = REFRESH_TTL_SECONDS * 1000;

export interface EmployeeTokenData {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  warehouseId: number | null;
  isActive: boolean;
  lastSeen: Date | null;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<TokenPair> {
    const employee = await this.prisma.employee.findUnique({
      where: { email: dto.email },
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

    if (!employee) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, employee.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!employee.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { lastSeen: new Date() },
    });

    const permissions = this.extractPermissions(employee);
    return this.issueTokens(employee, permissions);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; jti: string };
    try {
      payload = this.jwtService.verify<{ sub: string; jti: string }>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const key = `refresh:${payload.sub}:${payload.jti}`;
    const exists = await this.redisService.exists(key);
    if (!exists) {
      throw new UnauthorizedException('Refresh token expired or already used');
    }

    await this.redisService.del(key);

    const employee = await this.prisma.employee.findUnique({
      where: { id: payload.sub },
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

    if (!employee) {
      throw new UnauthorizedException('Employee not found');
    }

    const permissions = this.extractPermissions(employee);
    return this.issueTokens(employee, permissions);
  }

  async generateLauncherCode(userId: string): Promise<{ code: string }> {
    const code = uuidv4();
    await this.redisService.set(`launcher_code:${code}`, userId, 'EX', 30);
    return { code };
  }

  async exchangeLauncherCode(code: string): Promise<TokenPair> {
    const userId = await this.redisService.get(`launcher_code:${code}`);
    if (!userId) {
      throw new UnauthorizedException('Code expired or already used');
    }
    await this.redisService.del(`launcher_code:${code}`);

    const employee = await this.prisma.employee.findUnique({
      where: { id: userId },
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

    if (!employee?.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const permissions = this.extractPermissions(employee);
    return this.issueTokens(employee, permissions);
  }

  async logout(refreshToken: string): Promise<void> {
    // token may be expired, decode without verification
    const payload = this.jwtService.decode(refreshToken) as {
      sub?: string;
      jti?: string;
    } | null;

    if (payload?.sub && payload?.jti) {
      await this.redisService.del(`refresh:${payload.sub}:${payload.jti}`);
    }
  }

  async issueTokens(
    employee: EmployeeTokenData,
    permissions: string[],
  ): Promise<TokenPair> {
    const tokenId = uuidv4();

    const accessPayload: JwtPayload = {
      sub: employee.id,
      email: employee.email,
      firstName: employee.firstName,
      lastName: employee.lastName,
      warehouseId: employee.warehouseId,
      isActive: employee.isActive,
      permissions,
      lastSeen: employee.lastSeen?.toISOString() ?? null,
    };

    const refreshPayload = { sub: employee.id, jti: tokenId };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const access_token = this.jwtService.sign(accessPayload as any, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES_IN'),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refresh_token = this.jwtService.sign(refreshPayload as any, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN'),
    });

    await this.redisService.set(
      `refresh:${employee.id}:${tokenId}`,
      '1',
      'EX',
      REFRESH_TTL_SECONDS,
    );

    return { access_token, refresh_token };
  }

  setRefreshCookie(res: Response, token: string): void {
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: this.configService.get('COOKIE_SECURE') === 'true',
      sameSite: 'lax',
      maxAge: REFRESH_TTL_MS,
      path: '/api/auth',
    });
  }

  clearRefreshCookie(res: Response): void {
    res.clearCookie('refresh_token', { path: '/api/auth' });
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
      for (const rp of assignment.employeeRole.permissions) {
        permissionSet.add(rp.employeePermission.name);
      }
    }
    return Array.from(permissionSet);
  }
}
