import { Module } from '@nestjs/common';
import { DirectPriceListAssignmentService } from './direct-price-list-assignment.service';
import { PriceListController } from './price-list.controller';
import { PriceListService } from './price-list.service';

@Module({
  controllers: [PriceListController],
  providers: [DirectPriceListAssignmentService, PriceListService],
  exports: [DirectPriceListAssignmentService],
})
export class PriceListModule {}
