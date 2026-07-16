import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  RequireAllPermissions,
  RequirePermissions,
} from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CreateOrganizationWithPriceListAssignmentDto } from './dto/create-organization-with-price-list-assignment.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateOrganizationWithPriceListAssignmentDto } from './dto/update-organization-with-price-list-assignment.dto';
import { OrganizationService } from './organization.service';

@ApiTags('organization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @ApiOperation({ summary: 'Create an organization' })
  @RequirePermissions('organization:create')
  @Post()
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizationService.create(dto);
  }

  @ApiOperation({ summary: 'Create an organization and its direct price list assignment' })
  @RequireAllPermissions('organization:create', 'price_list:update')
  @Post('with-price-list-assignment')
  createWithPriceListAssignment(@Body() dto: CreateOrganizationWithPriceListAssignmentDto) {
    return this.organizationService.createWithPriceListAssignment(dto);
  }

  @ApiOperation({ summary: 'Get organization stats' })
  @Get(':id/stats')
  stats(@Param('id', ParseIntPipe) id: number) {
    return this.organizationService.stats(id);
  }

  @ApiOperation({ summary: 'Update an organization' })
  @RequirePermissions('organization:update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrganizationDto) {
    return this.organizationService.update(id, dto);
  }

  @ApiOperation({ summary: 'Update an organization and its direct price list assignment' })
  @RequireAllPermissions('organization:update', 'price_list:update')
  @Patch(':id/with-price-list-assignment')
  updateWithPriceListAssignment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrganizationWithPriceListAssignmentDto,
  ) {
    return this.organizationService.updateWithPriceListAssignment(id, dto);
  }
}
