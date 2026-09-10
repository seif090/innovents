import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';
import { ResourceOwnerGuard } from './resource-owner.guard';

describe('Authorization Guards', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  describe('RolesGuard', () => {
    let guard: RolesGuard;

    beforeEach(() => {
      guard = new RolesGuard(reflector);
    });

    it('should allow access if no roles are required', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);

      const context = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({ user: { roles: ['ATTENDEE'] } }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access if user has one of the required roles', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['SPONSOR', 'VENDOR']);

      const context = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({ user: { roles: ['SPONSOR'] } }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow ADMIN to access any role-protected route', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['SPONSOR']);

      const context = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({ user: { roles: ['ADMIN'] } }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny access if user lacks required role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['SPONSOR']);

      const context = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({ user: { roles: ['ATTENDEE'] } }),
        }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('PermissionsGuard', () => {
    let guard: PermissionsGuard;

    beforeEach(() => {
      guard = new PermissionsGuard(reflector);
    });

    it('should allow access if user has required permissions', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['event:create']);

      const context = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({
            user: { roles: ['EVENT_OWNER'], permissions: ['event:create', 'event:read'] },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow ADMIN to bypass specific permissions', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['special:perm']);

      const context = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({
            user: { roles: ['ADMIN'], permissions: [] },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny access if user lacks a required permission', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin:users:manage']);

      const context = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({
            user: { roles: ['ATTENDEE'], permissions: ['event:read'] },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('ResourceOwnerGuard', () => {
    let guard: ResourceOwnerGuard;

    beforeEach(() => {
      guard = new ResourceOwnerGuard();
    });

    it('should allow access if user ID matches route parameter userId', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { sub: 'user-123', roles: ['ATTENDEE'] },
            params: { userId: 'user-123' },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow ADMIN access even if user ID does not match parameter', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { sub: 'admin-user', roles: ['ADMIN'] },
            params: { userId: 'other-user' },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny access if user attempts to modify another user resource (horizontal bypass attempt)', () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { sub: 'attacker-user', roles: ['ATTENDEE'] },
            params: { userId: 'victim-user' },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
