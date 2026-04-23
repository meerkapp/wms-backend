import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SyncService, SYNC_TABLE_MAP } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @ApiOperation({ summary: 'Pull records for sync' })
  @ApiQuery({ name: 'since', required: false, description: 'ISO datetime — return only records updated after this time' })
  @Get(':table')
  async pull(
    @Param('table') table: string,
    @Query('since') since?: string,
  ) {
    if (!(table in SYNC_TABLE_MAP)) {
      return { items: [] };
    }
    const sinceDate = since ? new Date(since) : undefined;
    const validSince = sinceDate && !isNaN(sinceDate.getTime()) ? sinceDate : undefined;
    return this.syncService.pull(table, validSince);
  }
}
