import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ProductItemStatsFetchQueryDto } from './dto/product-item-stats-fetch-query.dto';
import {
  parseOptionalNullablePositiveInt,
  parseOptionalPositiveInt,
  parseRequiredPositiveInt,
  parseSyncCursor,
  parseSyncLimit,
  SyncService,
} from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @ApiOperation({ summary: 'Pull records for sync' })
  @ApiQuery({
    name: 'table',
    required: true,
    description: 'Table name to sync',
  })
  @ApiQuery({
    name: 'since',
    required: false,
    description: 'Cursor/ISO datetime — return only records updated after this cursor',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Optional page size. Omitted keeps full-response compatibility.',
  })
  @Get('pull')
  async pull(
    @Query('table') table: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return this.syncService.pull(table, parseSyncCursor(since, 'since'), parseSyncLimit(limit));
  }

  @ApiOperation({ summary: 'Fetch product items by id or collection' })
  @ApiQuery({ name: 'id', required: false, description: 'Product item id' })
  @ApiQuery({
    name: 'productCollectionId',
    required: false,
    description: 'Collection id, or "null" for root collection',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Optional page size, capped server-side',
  })
  @Get('fetch/product-items')
  fetchProductItems(
    @Query('id') id?: string,
    @Query('productCollectionId') productCollectionId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.syncService.fetchProductItems({
      id: parseOptionalPositiveInt(id, 'id'),
      productCollectionId: parseOptionalNullablePositiveInt(
        productCollectionId,
        'productCollectionId',
      ),
      limit: parseSyncLimit(limit),
    });
  }

  @ApiOperation({ summary: 'Fetch product barcodes by code or product item' })
  @ApiQuery({ name: 'code', required: false, description: 'Barcode value' })
  @ApiQuery({ name: 'productItemId', required: false, description: 'Product item id' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Optional page size, capped server-side',
  })
  @Get('fetch/product-barcodes')
  fetchProductBarcodes(
    @Query('code') code?: string,
    @Query('productItemId') productItemId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.syncService.fetchProductBarcodes({
      code,
      productItemId: parseOptionalPositiveInt(productItemId, 'productItemId'),
      limit: parseSyncLimit(limit),
    });
  }

  @ApiOperation({ summary: 'Fetch product shipments by warehouse' })
  @ApiQuery({ name: 'warehouseId', required: true, description: 'Warehouse id' })
  @ApiQuery({ name: 'productItemId', required: false, description: 'Product item id' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Optional page size, capped server-side',
  })
  @Get('fetch/product-shipments')
  fetchProductShipments(
    @Query('warehouseId') warehouseId?: string,
    @Query('productItemId') productItemId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.syncService.fetchProductShipments({
      warehouseId: parseRequiredPositiveInt(warehouseId, 'warehouseId'),
      productItemId: parseOptionalPositiveInt(productItemId, 'productItemId'),
      limit: parseSyncLimit(limit),
    });
  }

  @ApiOperation({ summary: 'Fetch product item stats by warehouse and optional collection' })
  @ApiQuery({ name: 'productCollectionId', required: false, description: 'Product collection id' })
  @ApiQuery({ name: 'warehouseId', required: true, description: 'Warehouse id' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Continuation cursor' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Optional page size, capped server-side',
  })
  @Get('fetch/product-item-stats')
  fetchProductItemStats(@Query() query: ProductItemStatsFetchQueryDto) {
    return this.syncService.fetchProductItemStats({
      ...query,
      limit: parseSyncLimit(query.limit),
    });
  }
}
