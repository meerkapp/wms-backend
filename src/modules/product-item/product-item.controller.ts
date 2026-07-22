import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { FindProductItemFavoritesDto } from './dto/find-product-item-favorites.dto';
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
}
