import { Module, OnModuleInit } from '@nestjs/common';
import { ProductItemModule } from '../product-item/product-item.module';
import { ProductItemService } from '../product-item/product-item.service';
import { SyncController } from './sync.controller';
import { SyncGateway } from './sync.gateway';
import { SyncService } from './sync.service';

@Module({
  imports: [ProductItemModule],
  controllers: [SyncController],
  providers: [SyncService, SyncGateway],
  exports: [SyncGateway],
})
export class SyncModule implements OnModuleInit {
  constructor(
    private readonly syncService: SyncService,
    private readonly productItemService: ProductItemService,
  ) {}

  onModuleInit() {
    this.syncService.registerFetchHandler('product_item', this.productItemService);
  }
}
