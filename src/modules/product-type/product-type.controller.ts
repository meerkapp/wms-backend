import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { UpdateProductTypeDto } from './dto/update-product-type.dto';
import { ProductTypeService } from './product-type.service';

@ApiTags('product-type')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('product-type')
export class ProductTypeController {
  constructor(private readonly productTypeService: ProductTypeService) {}

  @ApiOperation({ summary: 'Get all product types' })
  @Get()
  findAll() {
    return this.productTypeService.findAll();
  }

  @ApiOperation({ summary: 'Get product type by id' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productTypeService.findOne(id);
  }

  @ApiOperation({ summary: 'Create product type' })
  @RequirePermissions('product_type:create')
  @Post()
  create(@Body() dto: CreateProductTypeDto) {
    return this.productTypeService.create(dto);
  }

  @ApiOperation({ summary: 'Update product type' })
  @RequirePermissions('product_type:update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductTypeDto) {
    return this.productTypeService.update(id, dto);
  }
}
