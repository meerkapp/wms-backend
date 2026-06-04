import { Module } from '@nestjs/common';
import { ProductItemController } from './product-item.controller';
import { ProductItemService } from './product-item.service';

@Module({
  controllers: [ProductItemController],
  providers: [ProductItemService],
  exports: [ProductItemService],
})
export class ProductItemModule {}
