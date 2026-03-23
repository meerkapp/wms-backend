import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { PresenceModule } from './modules/presence/presence.module';
import { CityModule } from './modules/city/city.module';
import { CountryModule } from './modules/country/country.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { SetupModule } from './modules/setup/setup.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { SyncModule } from './modules/sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AuthModule,
    PresenceModule,
    SetupModule,
    SyncModule,
    CountryModule,
    CityModule,
    OrganizationModule,
    WarehouseModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'frontend'),
      exclude: ['/api/{*path}'],
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
