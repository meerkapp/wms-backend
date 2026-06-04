import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { UpdatePriceListDto } from './dto/update-price-list.dto';
import { PriceListService } from './price-list.service';

@ApiTags('price-list')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('price-list')
export class PriceListController {
  constructor(private readonly priceListService: PriceListService) {}

  @ApiOperation({ summary: 'Get all price lists' })
  @Get()
  findAll() {
    return this.priceListService.findAll();
  }

  @ApiOperation({ summary: 'Create a price list' })
  @RequirePermissions('price_list:create')
  @Post()
  create(@Body() dto: CreatePriceListDto) {
    return this.priceListService.create(dto);
  }

  @ApiOperation({ summary: 'Update a price list' })
  @RequirePermissions('price_list:update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePriceListDto) {
    return this.priceListService.update(id, dto);
  }
}
