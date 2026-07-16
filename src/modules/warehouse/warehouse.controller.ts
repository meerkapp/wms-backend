import { Body, Controller, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  RequireAllPermissions,
  RequirePermissions,
} from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateWarehouseWithPriceListAssignmentDto } from './dto/create-warehouse-with-price-list-assignment.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { UpdateWarehouseWithPriceListAssignmentDto } from './dto/update-warehouse-with-price-list-assignment.dto';
import { WarehouseService } from './warehouse.service';

@ApiTags('warehouse')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @ApiOperation({ summary: 'Create a warehouse' })
  @RequirePermissions('warehouse:create')
  @Post()
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehouseService.create(dto);
  }

  @ApiOperation({ summary: 'Create a warehouse and its direct price list assignment' })
  @RequireAllPermissions('warehouse:create', 'price_list:update')
  @Post('with-price-list-assignment')
  createWithPriceListAssignment(@Body() dto: CreateWarehouseWithPriceListAssignmentDto) {
    return this.warehouseService.createWithPriceListAssignment(dto);
  }

  @ApiOperation({ summary: 'Update a warehouse' })
  @RequirePermissions('warehouse:update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWarehouseDto) {
    return this.warehouseService.update(id, dto);
  }

  @ApiOperation({ summary: 'Update a warehouse and its direct price list assignment' })
  @RequireAllPermissions('warehouse:update', 'price_list:update')
  @Patch(':id/with-price-list-assignment')
  updateWithPriceListAssignment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWarehouseWithPriceListAssignmentDto,
  ) {
    return this.warehouseService.updateWithPriceListAssignment(id, dto);
  }
}
