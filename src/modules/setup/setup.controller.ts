import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { AuthResponseDto } from '../auth/dto/auth-response.dto';
import { InitDto } from './dto/init.dto';
import { SetupService } from './setup.service';

@ApiTags('setup')
@Controller('setup')
export class SetupController {
  constructor(
    private readonly setupService: SetupService,
    private readonly authService: AuthService,
  ) {}

  @ApiOperation({ summary: 'Check if initial setup is required' })
  @ApiResponse({ status: 200, schema: { example: { setupRequired: true } } })
  @Get('status')
  getStatus(): Promise<{ setupRequired: boolean }> {
    return this.setupService.getStatus();
  }

  @ApiOperation({ summary: 'Create first admin and complete setup' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 403, description: 'Setup already completed' })
  @Post('init')
  @HttpCode(HttpStatus.CREATED)
  async init(
    @Body() dto: InitDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ access_token: string }> {
    const { access_token, refresh_token } = await this.setupService.init(dto);
    this.authService.setRefreshCookie(res, refresh_token);
    return { access_token };
  }
}
