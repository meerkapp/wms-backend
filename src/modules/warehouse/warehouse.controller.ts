import { Body, Controller, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseService } from './warehouse.service';

@ApiTags('warehouse')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @ApiOperation({ summary: 'Create a warehouse' })
  @Post()
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehouseService.create(dto);
  }

  @ApiOperation({ summary: 'Update a warehouse' })
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWarehouseDto) {
    return this.warehouseService.update(id, dto);
  }
}
