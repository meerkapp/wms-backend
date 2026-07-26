import { ForbiddenException } from '@nestjs/common';
import { AccessScopeType } from '@meerkapp/wms-contracts';
import { ActorRoleAccess, RoleHierarchyService } from './role-hierarchy.service';

function access(
  position: number | null,
  options: {
    isSuperadmin?: boolean;
    scopeType?: AccessScopeType;
    warehouseId?: number | null;
    permissions?: string[];
  } = {},
): ActorRoleAccess {
  const {
    isSuperadmin = false,
    scopeType = 'GLOBAL',
    warehouseId = null,
    permissions = [],
  } = options;

  return {
    isSuperadmin,
    grants:
      position === null
        ? []
        : [
            {
              scopeType,
              warehouseId,
              employeeRole: {
                id: 1,
                name: isSuperadmin ? 'superadmin' : 'actor',
                position,
                permissions: new Set(permissions),
              },
            },
          ],
  };
}

describe('RoleHierarchyService', () => {
  const service = new RoleHierarchyService();

  it('only lets a regular actor manage roles strictly below their global role', () => {
    const actor = access(10);

    expect(service.canManageRole(actor, { name: 'lower', position: 9 })).toBe(true);
    expect(service.canManageRole(actor, { name: 'equal', position: 10 })).toBe(false);
    expect(service.canManageRole(actor, { name: 'higher', position: 11 })).toBe(false);
    expect(() => service.assertCanManageRole(actor, { name: 'equal', position: 10 })).toThrow(
      ForbiddenException,
    );
  });

  it('does not use a warehouse-scoped position for global role management', () => {
    const actor = access(10, { scopeType: 'WAREHOUSE', warehouseId: 12 });

    expect(service.canManageRole(actor, { name: 'lower', position: 9 })).toBe(false);
    expect(service.getEffectiveRolePosition(actor, { warehouseId: 12 })).toBe(10);
    expect(service.getEffectiveRolePosition(actor, { warehouseId: 15 })).toBeNull();
  });

  it('matches resource permissions against global or matching warehouse grants', () => {
    const actor = access(10, {
      scopeType: 'WAREHOUSE',
      warehouseId: 12,
      permissions: ['employee:update:info'],
    });

    expect(service.hasPermissionInContext(actor, 'employee:update:info', { warehouseId: 12 })).toBe(
      true,
    );
    expect(service.hasPermissionInContext(actor, 'employee:update:info', { warehouseId: 15 })).toBe(
      false,
    );
    expect(
      service.hasPermissionInContext(actor, 'employee:update:info', { warehouseId: null }),
    ).toBe(false);
  });

  it('never grants a global-only permission from a warehouse binding', () => {
    const actor = access(10, {
      scopeType: 'WAREHOUSE',
      warehouseId: 12,
      permissions: ['role:update'],
    });

    expect(service.hasPermissionInContext(actor, 'role:update', { warehouseId: null })).toBe(false);
    expect(service.hasPermissionInContext(actor, 'role:update', { warehouseId: 12 })).toBe(false);
  });

  it('ignores an invalid warehouse binding completely, including its hierarchy position', async () => {
    const client = {
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          isActive: true,
          roleAssignments: [
            {
              scopeType: 'WAREHOUSE',
              warehouseId: 12,
              employeeRole: {
                id: 1,
                name: 'invalid warehouse role',
                position: 100,
                permissions: [
                  {
                    employeePermission: {
                      name: 'role:update',
                    },
                  },
                ],
              },
            },
          ],
        }),
      },
    };

    const actor = await service.getActorAccess(client as never, 'actor-id');

    expect(actor.grants).toEqual([]);
    expect(service.getEffectiveRolePosition(actor, { warehouseId: 12 })).toBeNull();
  });

  it('reports a role assignable only when permission, hierarchy and delegation all match', () => {
    const actor = access(10, {
      permissions: ['employee:update:roles', 'employee:update:info'],
    });
    const role = {
      name: 'employee editor',
      position: 9,
      permissions: [{ employeePermission: { name: 'employee:update:info' } }],
    };

    expect(service.canAssignRoleInAnyScope(actor, role)).toBe(true);
    expect(
      service.canAssignRoleInAnyScope(
        access(10, { permissions: ['employee:update:roles'] }),
        role,
      ),
    ).toBe(false);
    expect(
      service.canAssignRoleInAnyScope(
        access(10, { permissions: ['employee:update:info'] }),
        role,
      ),
    ).toBe(false);
  });

  it('treats superadmin as the owner while keeping its own role immutable', () => {
    const superadmin = access(2_000_000_000, { isSuperadmin: true });

    expect(service.canManageRole(superadmin, { name: 'manager', position: 100 })).toBe(true);
    expect(
      service.canManageRole(superadmin, {
        name: 'superadmin',
        position: 2_000_000_000,
      }),
    ).toBe(false);
    expect(
      service.canAssignRoleInAnyScope(superadmin, {
        name: 'superadmin',
        position: 2_000_000_000,
        permissions: [],
      }),
    ).toBe(true);
  });
});
