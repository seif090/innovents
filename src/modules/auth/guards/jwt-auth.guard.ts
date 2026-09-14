import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { TokenService, JwtPayload } from '../services/token.service';

import { IS_PUBLIC_KEY } from '../constants/auth.constants';

declare module 'express' {
  interface Request {
    user?: JwtPayload;
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();

    const authHeader = request.headers.authorization;

    /**
     * Public endpoint:
     * token is optional.
     */
    if (isPublic) {
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];

        if (token) {
          try {
            const payload = this.tokenService.verifyAccessToken(token);

            const revoked = await this.tokenService.isAccessTokenRevoked(payload.jti);

            if (!revoked) {
              request.user = payload;
            }
          } catch {
            // Optional authentication.
            // Ignore invalid/revoked token.
          }
        }
      }

      return true;
    }

    /**
     * Protected endpoint:
     * token is required.
     */
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication credentials missing or malformed');
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      throw new UnauthorizedException('Bearer token missing');
    }

    const payload = this.tokenService.verifyAccessToken(token);

    /**
     * Check Redis blacklist.
     */
    const revoked = await this.tokenService.isAccessTokenRevoked(payload.jti);

    if (revoked) {
      throw new UnauthorizedException('Access token has been revoked. Please log in again.');
    }

    request.user = payload;

    return true;
  }
}
