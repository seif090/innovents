import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ResourceOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User context not established');
    }

    // Admins bypass resource ownership checks
    if (user.roles && user.roles.includes('ADMIN')) {
      return true;
    }

    // Resource ID extracted from route parameters
    const targetResourceId = request.params['userId'] || request.params['id'];

    if (!targetResourceId) {
      return true; // No explicit resource ID parameter in route
    }

    if (user.sub !== targetResourceId) {
      throw new ForbiddenException(
        'Access denied: You do not possess ownership authorization for this resource',
      );
    }

    return true;
  }
}
