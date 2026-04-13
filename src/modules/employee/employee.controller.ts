import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { FindEmployeesDto } from './dto/find-employees.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateOwnPasswordDto, UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { EmployeeService } from './employee.service';

const AVATAR_FILE_FILTER = (
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!file.mimetype.match(/^image\/(jpeg|png|webp)$/)) {
    return cb(new BadRequestException('Only jpeg, png, webp images are allowed'), false);
  }
  cb(null, true);
};

const AVATAR_INTERCEPTOR = FileInterceptor('file', {
  storage: memoryStorage(),
  fileFilter: AVATAR_FILE_FILTER,
  limits: { fileSize: 5 * 1024 * 1024 },
});

@ApiTags('employee')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('employee')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @ApiOperation({ summary: 'Create an employee' })
  @RequirePermissions('employee:create')
  @Post()
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeeService.create(dto);
  }

  @ApiOperation({ summary: 'Get all employees' })
  @Get()
  findAll(@Query() query: FindEmployeesDto) {
    return this.employeeService.findAll(query.page, query.limit);
  }

  @ApiOperation({ summary: 'Get own profile' })
  @Get('me')
  getMe(@CurrentUser() user: JwtPayload) {
    return this.employeeService.findOne(user.sub);
  }

  @ApiOperation({ summary: 'Upload own avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @RequirePermissions('employee:update:own:avatar')
  @Post('me/avatar')
  @UseInterceptors(AVATAR_INTERCEPTOR)
  uploadOwnAvatar(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.employeeService.uploadAvatar(user.sub, file);
  }

  @ApiOperation({ summary: 'Delete own avatar' })
  @RequirePermissions('employee:update:own:avatar')
  @Delete('me/avatar')
  deleteOwnAvatar(@CurrentUser() user: JwtPayload) {
    return this.employeeService.deleteAvatar(user.sub);
  }

  @ApiOperation({ summary: 'Update own profile' })
  @RequirePermissions(
    'employee:update:own:info',
    'employee:update:own:email',
  )
  @Patch('me')
  updateOwnProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateOwnProfileDto,
  ) {
    return this.employeeService.updateOwnProfile(user.sub, dto, user.permissions);
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
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeeService.findOne(id);
  }

  @ApiOperation({ summary: 'Upload avatar for employee' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @RequirePermissions('employee:update:avatar')
  @Post(':id/avatar')
  @UseInterceptors(AVATAR_INTERCEPTOR)
  uploadAvatar(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.employeeService.uploadAvatar(id, file);
  }

  @ApiOperation({ summary: 'Delete avatar for employee' })
  @RequirePermissions('employee:update:avatar')
  @Delete(':id/avatar')
  deleteAvatar(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeeService.deleteAvatar(id);
  }

  @ApiOperation({ summary: 'Update employee' })
  @RequirePermissions(
    'employee:update:info',
    'employee:update:warehouse',
    'employee:update:roles',
    'employee:update:email',
    'employee:update:password',
    'employee:toggle:active',
  )
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.employeeService.update(id, dto, user.permissions);
  }

}
