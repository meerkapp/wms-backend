import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { ProductCollectionController } from './product-collection.controller';
import { ProductCollectionService } from './product-collection.service';

@Module({
  imports: [SyncModule],
  controllers: [ProductCollectionController],
  providers: [ProductCollectionService],
  exports: [ProductCollectionService],
})
export class ProductCollectionModule {}
