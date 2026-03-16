import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { readFileSync } from 'fs';
import { join } from 'path';

const pkg = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf-8'),
) as { version: string };

@ApiTags('app')
@Controller()
export class AppController {
  @ApiOperation({ summary: 'Application manifest' })
  @ApiResponse({ status: 200 })
  @Get('manifest')
  manifest() {
    return {
      name: 'Meerk WMS',
      version: pkg.version,
      min_launcher_version: '1.0.0',
    };
  }

  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, schema: { example: { status: 'ok' } } })
  @Get('healthcheck')
  healthcheck() {
    return { status: 'ok' };
  }
}
