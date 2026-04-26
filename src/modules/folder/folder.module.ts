import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { FolderController } from './folder.controller';
import { FolderService } from './folder.service';

@Module({
  imports: [SyncModule],
  controllers: [FolderController],
  providers: [FolderService],
  exports: [FolderService],
})
export class FolderModule {}
