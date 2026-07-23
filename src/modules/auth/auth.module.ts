import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { StorageModule } from '../../common/storage/storage.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PermissionsSyncService } from './permissions-sync.service';
import { DeviceSessionService } from './device-session.service';

@Module({
  imports: [PassportModule, JwtModule.register({}), StorageModule],
  controllers: [AuthController],
  providers: [AuthService, DeviceSessionService, JwtStrategy, PermissionsSyncService],
  exports: [AuthService],
})
export class AuthModule {}
