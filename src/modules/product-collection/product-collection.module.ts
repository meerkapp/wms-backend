import { Module } from '@nestjs/common';
import { ProductCollectionController } from './product-collection.controller';
import { ProductCollectionService } from './product-collection.service';

@Module({
  controllers: [ProductCollectionController],
  providers: [ProductCollectionService],
  exports: [ProductCollectionService],
})
export class ProductCollectionModule {}
