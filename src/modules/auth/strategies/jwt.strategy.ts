import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  firstName: string;
  lastName: string;
  warehouseId: number | null;
  isActive: boolean;
  permissions: string[];
  lastSeen: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET') ?? '',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: payload.sub },
      select: { isActive: true },
    });

    if (!employee?.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    return payload;
  }
}
