import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ProductItemStatsQueryDto } from './dto/product-item-stats-query.dto';
import { ProductItemService } from './product-item.service';

@ApiTags('product-item')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('product-item')
export class ProductItemController {
  constructor(private readonly productItemService: ProductItemService) {}

  @ApiOperation({ summary: 'Get product items stats by collection and warehouse' })
  @Get('stats')
  getStats(@Query() query: ProductItemStatsQueryDto) {
    return this.productItemService.getStats(query.productCollectionId, query.warehouseId);
  }
}
