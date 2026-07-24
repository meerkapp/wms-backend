import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { StorageModule } from '../../common/storage/storage.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PermissionsSyncService } from './permissions-sync.service';
import { DeviceSessionService } from './device-session.service';

function positiveInteger(config: ConfigService, name: string, fallback: number): number {
  const value = Number(config.get<string>(name) ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    StorageModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'login-ip',
          limit: positiveInteger(config, 'AUTH_LOGIN_IP_LIMIT', 100),
          ttl: positiveInteger(config, 'AUTH_LOGIN_IP_TTL_MS', 60_000),
          blockDuration: positiveInteger(config, 'AUTH_LOGIN_IP_BLOCK_MS', 5 * 60_000),
          getTracker: (request) => String(request.ip ?? 'unknown'),
        },
        {
          name: 'login-account',
          limit: positiveInteger(config, 'AUTH_LOGIN_ACCOUNT_LIMIT', 20),
          ttl: positiveInteger(config, 'AUTH_LOGIN_ACCOUNT_TTL_MS', 5 * 60_000),
          blockDuration: positiveInteger(config, 'AUTH_LOGIN_ACCOUNT_BLOCK_MS', 15 * 60_000),
          getTracker: (request) => {
            const email = request.body?.email;
            return typeof email === 'string' && email.trim().length > 0
              ? email.trim().toLowerCase()
              : String(request.ip ?? 'unknown');
          },
        },
      ],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, DeviceSessionService, JwtStrategy, PermissionsSyncService],
  exports: [AuthService],
})
export class AuthModule {}
