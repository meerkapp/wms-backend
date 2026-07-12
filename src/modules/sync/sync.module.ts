import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SyncController } from './sync.controller';
import { SyncEventsService } from './sync-events.service';
import { SyncGateway } from './sync.gateway';
import { SyncService } from './sync.service';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [SyncController],
  providers: [SyncService, SyncGateway, SyncEventsService],
  exports: [SyncGateway, SyncEventsService],
})
export class SyncModule {}
