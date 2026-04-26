import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { FolderService } from './folder.service';

@ApiTags('folder')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('folder')
export class FolderController {
  constructor(private readonly folderService: FolderService) {}

  @ApiOperation({ summary: 'Get all folders' })
  @Get()
  findAll() {
    return this.folderService.findAll();
  }

  @ApiOperation({ summary: 'Get folder by id' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.folderService.findOne(id);
  }

  @ApiOperation({ summary: 'Create folder' })
  @RequirePermissions('folder:create')
  @Post()
  create(@Body() dto: CreateFolderDto) {
    return this.folderService.create(dto);
  }

  @ApiOperation({ summary: 'Update folder' })
  @RequirePermissions('folder:update')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFolderDto) {
    return this.folderService.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete folder' })
  @RequirePermissions('folder:delete')
  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.folderService.delete(id);
  }

  @ApiOperation({ summary: 'Pin folder' })
  @RequirePermissions('folder:pin')
  @Post(':id/pin')
  @HttpCode(HttpStatus.OK)
  pin(@Param('id', ParseIntPipe) id: number) {
    return this.folderService.pin(id);
  }

  @ApiOperation({ summary: 'Unpin folder' })
  @RequirePermissions('folder:pin')
  @Delete(':id/pin')
  unpin(@Param('id', ParseIntPipe) id: number) {
    return this.folderService.unpin(id);
  }

  @ApiOperation({ summary: 'Move folder up in pin order' })
  @RequirePermissions('folder:pin')
  @Patch(':id/move-up')
  moveUp(@Param('id', ParseIntPipe) id: number) {
    return this.folderService.moveUp(id);
  }

  @ApiOperation({ summary: 'Move folder down in pin order' })
  @RequirePermissions('folder:pin')
  @Patch(':id/move-down')
  moveDown(@Param('id', ParseIntPipe) id: number) {
    return this.folderService.moveDown(id);
  }
}
