import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { LocalityService } from './locality.service';
import { CreateLocalityDto } from './dto/create-locality.dto';

@ApiTags('locality')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('locality')
export class LocalityController {
  constructor(private readonly localityService: LocalityService) {}

  @ApiOperation({ summary: 'Create a locality' })
  @RequirePermissions('locality:create')
  @Post()
  create(@Body() dto: CreateLocalityDto) {
    return this.localityService.create(dto);
  }
}
