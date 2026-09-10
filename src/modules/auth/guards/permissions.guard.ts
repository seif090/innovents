import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_KEY } from '../constants/auth.constants';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user || !user.permissions) {
      throw new ForbiddenException('User context or permissions not established');
    }

    // Admin / Superuser override
    if (user.roles.includes('ADMIN') || user.permissions.includes('manage:all')) {
      return true;
    }

    const hasAll = requiredPermissions.every((perm) => user.permissions.includes(perm));

    if (!hasAll) {
      throw new ForbiddenException(
        `Access denied: Missing required permission(s) [${requiredPermissions.join(', ')}]`,
      );
    }

    return true;
  }
}
