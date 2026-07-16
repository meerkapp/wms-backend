import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { SetDirectPriceListAssignmentDto } from './dto/set-direct-price-list-assignment.dto';
import { SetPriceListAssignmentsDto } from './dto/set-price-list-assignments.dto';
import { UpdatePriceListDto } from './dto/update-price-list.dto';
import { UpdatePriceListPricesDto } from './dto/update-price-list-prices.dto';
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

  @ApiOperation({ summary: 'Get the direct price list assignment for a warehouse' })
  @Get('assignments/warehouse/:warehouseId')
  findWarehouseAssignment(@Param('warehouseId', ParseIntPipe) warehouseId: number) {
    return this.priceListService.findWarehouseAssignment(warehouseId);
  }

  @ApiOperation({ summary: 'Set or remove the direct price list assignment for a warehouse' })
  @RequirePermissions('price_list:update')
  @Put('assignments/warehouse/:warehouseId')
  setWarehouseAssignment(
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
    @Body() dto: SetDirectPriceListAssignmentDto,
  ) {
    return this.priceListService.setWarehouseAssignment(warehouseId, dto);
  }

  @ApiOperation({ summary: 'Get the direct price list assignment for an organization' })
  @Get('assignments/organization/:organizationId')
  findOrganizationAssignment(@Param('organizationId', ParseIntPipe) organizationId: number) {
    return this.priceListService.findOrganizationAssignment(organizationId);
  }

  @ApiOperation({ summary: 'Set or remove the direct price list assignment for an organization' })
  @RequirePermissions('price_list:update')
  @Put('assignments/organization/:organizationId')
  setOrganizationAssignment(
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Body() dto: SetDirectPriceListAssignmentDto,
  ) {
    return this.priceListService.setOrganizationAssignment(organizationId, dto);
  }

  @ApiOperation({ summary: 'Get price list assignments' })
  @Get(':id/assignments')
  findAssignments(@Param('id', ParseIntPipe) id: number) {
    return this.priceListService.findAssignments(id);
  }

  @ApiOperation({ summary: 'Replace price list assignments' })
  @RequirePermissions('price_list:update')
  @Put(':id/assignments')
  setAssignments(@Param('id', ParseIntPipe) id: number, @Body() dto: SetPriceListAssignmentsDto) {
    return this.priceListService.setAssignments(id, dto);
  }

  @ApiOperation({ summary: 'Get product prices for a price list' })
  @Get(':id/prices')
  findPrices(@Param('id', ParseIntPipe) id: number) {
    return this.priceListService.findPrices(id);
  }

  @ApiOperation({ summary: 'Update product prices for a price list' })
  @RequirePermissions('price_list:update')
  @Put(':id/prices')
  updatePrices(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePriceListPricesDto) {
    return this.priceListService.updatePrices(id, dto);
  }
}
