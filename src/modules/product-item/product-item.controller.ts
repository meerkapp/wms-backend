import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateProductItemDto } from './dto/create-product-item.dto';
import { FindArchivedProductItemsDto } from './dto/find-archived-product-items.dto';
import { FindProductItemByBarcodeDto } from './dto/find-product-item-by-barcode.dto';
import { FindProductItemFavoritesDto } from './dto/find-product-item-favorites.dto';
import { ProductItemStatsQueryDto } from './dto/product-item-stats-query.dto';
import { ProductItemService } from './product-item.service';

@ApiTags('product-item')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('product-item')
export class ProductItemController {
  constructor(private readonly productItemService: ProductItemService) {}

  @ApiOperation({ summary: 'Create a product item and generate its SKU' })
  @RequirePermissions('product_item:create')
  @Post()
  create(@Body() dto: CreateProductItemDto) {
    return this.productItemService.create(dto);
  }

  @ApiOperation({ summary: 'Get product items stats by collection and warehouse' })
  @Get('stats')
  getStats(@Query() query: ProductItemStatsQueryDto) {
    return this.productItemService.getStats(query.productCollectionId, query.warehouseId);
  }

  @ApiOperation({ summary: 'Get archived product items' })
  @Get('archive')
  findArchived(@Query() query: FindArchivedProductItemsDto) {
    return this.productItemService.findArchived(query.page, query.limit);
  }

  @ApiOperation({ summary: 'Find a product item by barcode, including archived items' })
  @Get('barcode')
  findByBarcode(@Query() query: FindProductItemByBarcodeDto) {
    return this.productItemService.findByBarcode(query.code);
  }

  @ApiOperation({ summary: 'Get current employee product favorites' })
  @Get('favorites')
  findFavorites(@CurrentUser() user: JwtPayload, @Query() query: FindProductItemFavoritesDto) {
    return this.productItemService.findFavorites(user.sub, query.page, query.limit);
  }

  @ApiOperation({ summary: 'Add a product item to current employee favorites' })
  @Put(':id/favorite')
  addFavorite(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.productItemService.addFavorite(user.sub, id);
  }

  @ApiOperation({ summary: 'Remove a product item from current employee favorites' })
  @Delete(':id/favorite')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFavorite(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.productItemService.removeFavorite(user.sub, id);
  }

  @ApiOperation({ summary: 'Archive an out-of-stock product item' })
  @RequirePermissions('product_item:archive')
  @Put(':id/archive')
  archive(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.productItemService.archive(user.sub, id);
  }

  @ApiOperation({ summary: 'Restore an archived product item' })
  @RequirePermissions('product_item:archive')
  @Delete(':id/archive')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.productItemService.restore(id);
  }
}
