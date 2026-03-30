import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { FindEmployeesDto } from './dto/find-employees.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateOwnEmailDto, UpdateOwnPasswordDto } from './dto/update-own-profile.dto';
import { EmployeeService } from './employee.service';

@ApiTags('employee')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('employee')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @ApiOperation({ summary: 'Get all employees' })
  @RequirePermissions('employee:read')
  @Get()
  findAll(@Query() query: FindEmployeesDto) {
    return this.employeeService.findAll(query.page, query.limit);
  }

  @ApiOperation({ summary: 'Get own profile' })
  @RequirePermissions('employee:read:own')
  @Get('me')
  getMe(@CurrentUser() user: JwtPayload) {
    return this.employeeService.findOne(user.sub);
  }

  @ApiOperation({ summary: 'Update own email' })
  @RequirePermissions('employee:update:own:email')
  @Patch('me/email')
  updateOwnEmail(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateOwnEmailDto,
  ) {
    return this.employeeService.updateOwnEmail(user.sub, dto);
  }

  @ApiOperation({ summary: 'Update own password' })
  @RequirePermissions('employee:update:own:password')
  @Patch('me/password')
  updateOwnPassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateOwnPasswordDto,
  ) {
    return this.employeeService.updateOwnPassword(user.sub, dto);
  }

  @ApiOperation({ summary: 'Get employee by id' })
  @RequirePermissions('employee:read')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeeService.findOne(id);
  }

  @ApiOperation({ summary: 'Update employee' })
  @RequirePermissions('employee:update')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeeService.update(id, dto);
  }

  @ApiOperation({ summary: 'Deactivate employee' })
  @RequirePermissions('employee:deactivate')
  @Patch(':id/deactivate')
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeeService.deactivate(id);
  }

  @ApiOperation({ summary: 'Assign role to employee' })
  @RequirePermissions('employee:assign:role')
  @Post(':id/roles/:roleId')
  assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    return this.employeeService.assignRole(id, roleId);
  }

  @ApiOperation({ summary: 'Remove role from employee' })
  @RequirePermissions('employee:assign:role')
  @Delete(':id/roles/:roleId')
  removeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    return this.employeeService.removeRole(id, roleId);
  }
}
