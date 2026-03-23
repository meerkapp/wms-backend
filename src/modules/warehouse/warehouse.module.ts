import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';

@Module({
  imports: [SyncModule],
  controllers: [WarehouseController],
  providers: [WarehouseService],
})
export class WarehouseModule {}
