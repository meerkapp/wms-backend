import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncGateway } from './sync.gateway';

@Module({
  controllers: [SyncController],
  providers: [SyncService, SyncGateway],
  exports: [SyncGateway],
})
export class SyncModule {}
