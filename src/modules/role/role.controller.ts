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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateRoleDto } from './dto/create-role.dto';
import { ReorderRolesDto } from './dto/reorder-roles.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleService } from './role.service';

@ApiTags('role')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('role')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @ApiOperation({ summary: 'Get all roles with permissions' })
  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.roleService.findAll(user.sub);
  }

  @ApiOperation({ summary: 'Get all available permissions' })
  @Get('permissions')
  findAllPermissions(@CurrentUser() user: JwtPayload) {
    return this.roleService.findAllPermissions(user.sub);
  }

  @ApiOperation({ summary: 'Get role by id' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.roleService.findOne(id, user.sub);
  }

  @ApiOperation({ summary: 'Create a role' })
  @RequirePermissions('role:create')
  @Post()
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: JwtPayload) {
    return this.roleService.create(dto, user.sub);
  }

  @ApiOperation({ summary: 'Reorder all roles below the acting employee highest role' })
  @RequirePermissions('role:update')
  @Put('order')
  reorder(@Body() dto: ReorderRolesDto, @CurrentUser() user: JwtPayload) {
    return this.roleService.reorder(dto, user.sub);
  }

  @ApiOperation({ summary: 'Update role name, color or permissions' })
  @RequirePermissions('role:update')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.roleService.update(id, dto, user.sub);
  }
}
