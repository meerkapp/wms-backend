import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @ApiOperation({ summary: 'Pull records for sync' })
  @ApiQuery({
    name: 'table',
    required: true,
    description: 'Table name to sync',
  })
  @ApiQuery({
    name: 'since',
    required: false,
    description: 'ISO datetime — return only records updated after this time',
  })
  @Get('pull')
  async pull(@Query('table') table: string, @Query('since') since?: string) {
    const sinceDate = since ? new Date(since) : undefined;
    const validSince = sinceDate && !isNaN(sinceDate.getTime()) ? sinceDate : undefined;
    return this.syncService.pull(table, validSince);
  }

  @ApiOperation({ summary: 'Fetch records by mingo selector (for AutoFetchCollection)' })
  @ApiQuery({
    name: 'table',
    required: true,
    description: 'Table name to fetch',
  })
  @ApiBody({ schema: { type: 'object', description: 'Mingo selector' } })
  @Post('fetch')
  async fetch(@Query('table') table: string, @Body() selector: Record<string, unknown>) {
    return this.syncService.fetch(table, selector);
  }
}
