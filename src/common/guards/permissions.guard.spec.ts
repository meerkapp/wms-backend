import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALL_PERMISSIONS_KEY, PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionsGuard } from './permissions.guard';

function contextWithPermissions(permissions: string[]): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user: { permissions } }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('keeps RequirePermissions as any-of semantics', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === PERMISSIONS_KEY ? ['folder:create', 'folder:update'] : undefined,
      ),
    } as unknown as Reflector;

    expect(
      new PermissionsGuard(reflector).canActivate(contextWithPermissions(['folder:update'])),
    ).toBe(true);
  });

  it('rejects RequireAllPermissions when one permission is missing', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === ALL_PERMISSIONS_KEY ? ['organization:update', 'price_list:update'] : undefined,
      ),
    } as unknown as Reflector;

    expect(
      new PermissionsGuard(reflector).canActivate(contextWithPermissions(['organization:update'])),
    ).toBe(false);
  });

  it('accepts RequireAllPermissions only when every permission is present', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === ALL_PERMISSIONS_KEY ? ['organization:update', 'price_list:update'] : undefined,
      ),
    } as unknown as Reflector;

    expect(
      new PermissionsGuard(reflector).canActivate(
        contextWithPermissions(['organization:update', 'price_list:update']),
      ),
    ).toBe(true);
  });
});
