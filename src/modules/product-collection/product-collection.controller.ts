import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CreateProductCollectionDto } from './dto/create-product-collection.dto';
import { UpdateProductCollectionDto } from './dto/update-product-collection.dto';
import { ProductCollectionService } from './product-collection.service';

@ApiTags('product-collection')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('product-collection')
export class ProductCollectionController {
  constructor(private readonly productCollectionService: ProductCollectionService) {}

  @ApiOperation({ summary: 'Get all product collections' })
  @Get()
  findAll() {
    return this.productCollectionService.findAll();
  }

  @ApiOperation({ summary: 'Get product collection by id' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productCollectionService.findOne(id);
  }

  @ApiOperation({ summary: 'Create product collection' })
  @RequirePermissions('product_collection:create')
  @Post()
  create(@Body() dto: CreateProductCollectionDto) {
    return this.productCollectionService.create(dto);
  }

  @ApiOperation({ summary: 'Update product collection' })
  @RequirePermissions('product_collection:update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductCollectionDto) {
    return this.productCollectionService.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete product collection' })
  @RequirePermissions('product_collection:delete')
  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.productCollectionService.delete(id);
  }
}
