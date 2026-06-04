import { Global, Module } from '@nestjs/common';
import { DbListenerService } from './db-listener.service';
import { SyncModule } from '../../modules/sync/sync.module';

@Global()
@Module({
  imports: [SyncModule],
  providers: [DbListenerService],
  exports: [DbListenerService],
})
export class DbListenerModule {}
