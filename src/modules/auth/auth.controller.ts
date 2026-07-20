import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ access_token: string }> {
    const { access_token, refresh_token } = await this.authService.login(dto);
    this.authService.setRefreshCookie(res, refresh_token);
    return { access_token };
  }

  @ApiOperation({
    summary: 'Refresh access token (rotation)',
    description: 'Uses the httpOnly refresh token cookie and rotates it after a successful refresh.',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @ApiCookieAuth('refresh_token')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ access_token: string }> {
    const refreshToken = req.cookies['refresh_token'] as string | undefined;
    if (!refreshToken) throw new UnauthorizedException();

    const { access_token, refresh_token } = await this.authService.refresh(refreshToken);
    this.authService.setRefreshCookie(res, refresh_token);
    return { access_token };
  }

  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  @ApiResponse({ status: 200 })
  @ApiBearerAuth()
  @ApiCookieAuth('refresh_token')
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean }> {
    const refreshToken = req.cookies['refresh_token'] as string | undefined;
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    this.authService.clearRefreshCookie(res);
    return { success: true };
  }

  @ApiOperation({ summary: 'Get current user info from JWT payload' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return {
      id: user.sub,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      warehouseId: user.warehouseId,
      permissions: user.permissions,
      lastSeen: user.lastSeen,
    };
  }
}
