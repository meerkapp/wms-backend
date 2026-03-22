import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [SyncModule],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
