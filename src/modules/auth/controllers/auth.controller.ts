import { Controller, Post, Get, Body, Req, Res, Query, HttpCode, HttpStatus } from '@nestjs/common';

import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from '../services/auth.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RequestOtpDto, VerifyOtpDto } from '../dto/otp.dto';
import { RefreshDto } from '../dto/refresh.dto';
import { RequestPasswordResetDto, ConfirmPasswordResetDto } from '../dto/password-reset.dto';
import { AuthResponseDto, AuthTokensDto } from '../dto/auth-response.dto';
import { ErrorResponseDto } from '../../../common/dto/error-response.dto';
import { Public } from '../decorators/public.decorator';
import { OAuthService } from '../services/oauth.service';
import { ConfigService } from '@nestjs/config';
import { OAuthExchangeDto } from '../dto/oauth-exchange.dto';
import { RegisterBusinessDto } from '../dto/register-business.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oauthService: OAuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get('oauth/google')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Start Google OAuth authentication',
    description:
      'Generates a secure Google OAuth authorization URL using state and PKCE, then redirects the user to Google.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirects the user to Google authentication.',
  })
  async googleOAuth(@Res() res: Response): Promise<void> {
    const url = await this.oauthService.getGoogleAuthorizationUrl();

    res.redirect(HttpStatus.FOUND, url);
  }

  @Public()
  @Get('oauth/google/callback')
  @ApiOperation({
    summary: 'Handle Google OAuth callback',
  })
  @ApiResponse({
    status: 200,
    description: 'Google authentication completed successfully.',
  })
  async googleOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.oauthService.handleGoogleCallback(code, state);

    const exchangeCode = await this.oauthService.createOAuthExchangeCode(result);

    const frontendUrl = this.configService.get<string>('oauth.frontendRedirectUrl');

    res.redirect(HttpStatus.FOUND, `${frontendUrl}?code=${encodeURIComponent(exchangeCode)}`);
  }

  @Public()
  @Post('oauth/exchange')
  @HttpCode(HttpStatus.OK)
  async exchangeOAuthCode(@Body() dto: OAuthExchangeDto) {
    return this.oauthService.exchangeOAuthCode(dto.code);
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 registrations per minute per IP
  @ApiOperation({
    summary: 'Register a new user account',
    description:
      'Creates user identity and assigns business role. An email OTP challenge is atomically generated and queued.',
  })
  @ApiResponse({
    status: 201,
    description: 'Registration successful. Verification code dispatched.',
    schema: {
      example: {
        success: true,
        data: {
          message:
            'Registration successful. A 6-digit verification code has been dispatched to your email.',
          email: 'attendee@example.com',
        },
        meta: {
          requestId: 'd3b07384-d113-46d8-99eb-03388c2ba43d',
          timestamp: '2026-09-10T22:00:00.000Z',
        },
      },
    },
  })
  @ApiConflictResponse({
    description: 'Email or phone already registered',
    type: ErrorResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed or role disallowed',
    type: ErrorResponseDto,
  })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
  ): Promise<{ message: string; email: string }> {
    return this.authService.register(dto, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('register/business')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Register a business account',
    description:
      'Registers a Sponsor, Vendor, Provider, Event Owner, or Media account. Email verification is required, followed by administrative approval.',
  })
  @ApiResponse({
    status: 201,
    description: 'Business registration successful. Verification code dispatched.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid business registration data',
  })
  @ApiResponse({
    status: 409,
    description: 'Email address or phone number already exists',
  })
  async registerBusiness(
    @Body() dto: RegisterBusinessDto,
    @Req() req: Request,
  ): Promise<{ message: string; email: string }> {
    return this.authService.registerBusiness(dto, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute per IP
  @ApiOperation({
    summary: 'Request a verification OTP code',
    description:
      'Generates and dispatches a 6-digit numeric OTP code. Enforces 60-second cooldown.',
  })
  @ApiResponse({
    status: 200,
    description: 'If account exists, code was dispatched',
  })
  @ApiBadRequestResponse({
    description: 'Cooldown active or invalid payload',
    type: ErrorResponseDto,
  })
  async requestOtp(
    @Body() dto: RequestOtpDto,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.requestOtp(dto, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 verification attempts per minute per IP
  @ApiOperation({
    summary: 'Verify an OTP challenge',
    description:
      'Verifies the 6-digit code. On successful email verification, activates Attendee or marks email verified.',
  })
  @ApiResponse({
    status: 200,
    description: 'Verification successful',
  })
  @ApiBadRequestResponse({
    description: 'Invalid or expired OTP code',
    type: ErrorResponseDto,
  })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.verifyOtp(dto, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 login attempts per minute per IP
  @ApiOperation({
    summary: 'Authenticate with email and password',
    description:
      'Verifies credentials, checks email verification and approval status, and returns JWT access + refresh tokens.',
  })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful',
    type: AuthResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials or unverified email',
    type: ErrorResponseDto,
  })
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthResponseDto> {
    return this.authService.login(dto, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 refresh calls per minute per IP
  @ApiOperation({
    summary: 'Rotate refresh token',
    description:
      'Validates and rotates the provided refresh token. Employs token family tracking and automatic compromise invalidation on reuse.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token successfully rotated',
    type: AuthTokensDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired, or compromised token',
    type: ErrorResponseDto,
  })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<AuthTokensDto> {
    return this.authService.refresh(dto, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Invalidate current session and refresh token family',
    description: 'Revokes the given refresh token lineage server-side.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
  })
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.logout(dto, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Request password reset code',
    description:
      'Initiates password reset flow. Returns a generic safe response to prevent account enumeration.',
  })
  @ApiResponse({
    status: 200,
    description: 'Reset code dispatched if account exists',
  })
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.requestPasswordReset(dto, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Confirm password reset with OTP',
    description:
      'Validates OTP, sets new password, and invalidates all existing user refresh sessions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successful',
  })
  @ApiBadRequestResponse({
    description: 'Invalid code or password does not meet complexity rules',
    type: ErrorResponseDto,
  })
  async confirmPasswordReset(
    @Body() dto: ConfirmPasswordResetDto,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    return this.authService.confirmPasswordReset(dto, req.ip, req.headers['user-agent']);
  }
}
