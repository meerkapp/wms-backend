import { Module } from '@nestjs/common';
import { ProductItemController } from './product-item.controller';
import { ProductItemCreationService } from './product-item-creation.service';
import { ProductItemService } from './product-item.service';

@Module({
  controllers: [ProductItemController],
  providers: [ProductItemCreationService, ProductItemService],
  exports: [ProductItemService],
})
export class ProductItemModule {}
