import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { LocalityController } from './locality.controller';
import { LocalityService } from './locality.service';

@Module({
  imports: [SyncModule],
  controllers: [LocalityController],
  providers: [LocalityService],
})
export class LocalityModule {}
