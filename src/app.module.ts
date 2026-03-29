import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { PresenceModule } from './modules/presence/presence.module';
import { LocalityModule } from './modules/locality/locality.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { SetupModule } from './modules/setup/setup.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { SyncModule } from './modules/sync/sync.module';
import { EmployeeModule } from './modules/employee/employee.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AuthModule,
    PresenceModule,
    SetupModule,
    SyncModule,
    LocalityModule,
    OrganizationModule,
    WarehouseModule,
    EmployeeModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'frontend'),
      exclude: ['/api/{*path}'],
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
