import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { AuthService, DeviceAccountSummary } from './auth.service';
import { DEVICE_SESSION_COOKIE } from './device-session.service';
import { AccountSessionDto } from './dto/account-session.dto';
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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ access_token: string }> {
    const currentSessionId = req.cookies[DEVICE_SESSION_COOKIE] as string | undefined;
    const { access_token, deviceSessionId } = await this.authService.login(dto, currentSessionId);
    this.authService.setDeviceSessionCookie(res, deviceSessionId);

    const legacyRefreshToken = req.cookies['refresh_token'] as string | undefined;
    if (legacyRefreshToken) await this.authService.revokeLegacyRefreshToken(legacyRefreshToken);
    this.authService.clearLegacyRefreshCookie(res);
    return { access_token };
  }

  @ApiOperation({
    summary: 'Refresh access for one account authorized on this device',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid device or account session' })
  @ApiCookieAuth(DEVICE_SESSION_COOKIE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: AccountSessionDto,
  ): Promise<{ access_token: string }> {
    const { access_token, deviceSessionId } = await this.authorizeAccount(req, dto.accountId);
    this.authService.setDeviceSessionCookie(res, deviceSessionId);
    this.authService.clearLegacyRefreshCookie(res);
    return { access_token };
  }

  @ApiOperation({ summary: 'List accounts authorized on this device' })
  @ApiResponse({ status: 200 })
  @ApiCookieAuth(DEVICE_SESSION_COOKIE)
  @Get('accounts')
  async accounts(@Req() req: Request): Promise<{ accounts: DeviceAccountSummary[] }> {
    const deviceSessionId = req.cookies[DEVICE_SESSION_COOKIE] as string | undefined;
    return {
      accounts: deviceSessionId ? await this.authService.listDeviceAccounts(deviceSessionId) : [],
    };
  }

  @ApiOperation({ summary: 'Activate an account authorized on this device' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Account is not authorized on this device' })
  @ApiCookieAuth(DEVICE_SESSION_COOKIE)
  @Post('accounts/:accountId/activate')
  @HttpCode(HttpStatus.OK)
  async activateAccount(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ access_token: string }> {
    const { access_token, deviceSessionId } = await this.authorizeAccount(req, accountId);
    this.authService.setDeviceSessionCookie(res, deviceSessionId);
    this.authService.clearLegacyRefreshCookie(res);
    return { access_token };
  }

  @ApiOperation({ summary: 'Remove one account from this device' })
  @ApiResponse({ status: 200 })
  @ApiCookieAuth(DEVICE_SESSION_COOKIE)
  @Delete('accounts/:accountId')
  async removeAccount(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean }> {
    const deviceSessionId = req.cookies[DEVICE_SESSION_COOKIE] as string | undefined;
    if (!deviceSessionId) throw new UnauthorizedException();

    const remaining = await this.authService.removeDeviceAccount(deviceSessionId, accountId);
    if (remaining === 0) this.authService.clearDeviceSessionCookie(res);
    return { success: true };
  }

  @ApiOperation({ summary: 'Remove the current account from this device' })
  @ApiResponse({ status: 200 })
  @ApiBearerAuth()
  @ApiCookieAuth(DEVICE_SESSION_COOKIE)
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: boolean }> {
    const deviceSessionId = req.cookies[DEVICE_SESSION_COOKIE] as string | undefined;
    if (deviceSessionId) {
      const remaining = await this.authService.removeDeviceAccount(deviceSessionId, user.sub);
      if (remaining === 0) this.authService.clearDeviceSessionCookie(res);
    }

    const legacyRefreshToken = req.cookies['refresh_token'] as string | undefined;
    if (legacyRefreshToken) await this.authService.revokeLegacyRefreshToken(legacyRefreshToken);
    this.authService.clearLegacyRefreshCookie(res);
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

  private authorizeAccount(req: Request, accountId: string) {
    const deviceSessionId = req.cookies[DEVICE_SESSION_COOKIE] as string | undefined;
    if (deviceSessionId) {
      return this.authService.activateAccount(deviceSessionId, accountId);
    }

    const legacyRefreshToken = req.cookies['refresh_token'] as string | undefined;
    if (legacyRefreshToken) {
      return this.authService.migrateLegacyRefreshToken(legacyRefreshToken, accountId);
    }

    throw new UnauthorizedException();
  }
}
