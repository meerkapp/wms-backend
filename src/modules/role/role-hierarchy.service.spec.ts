import { ForbiddenException } from '@nestjs/common';
import { AccessScopeType } from '@meerkapp/wms-contracts';
import { ActorRoleAccess, RoleHierarchyService } from './role-hierarchy.service';

function roleGrant(
  position: number,
  options: {
    id?: number;
    name?: string;
    scopeType?: AccessScopeType;
    warehouseId?: number | null;
    permissions?: string[];
  } = {},
): ActorRoleAccess['grants'][number] {
  const {
    id = 1,
    name = 'actor',
    scopeType = 'GLOBAL',
    warehouseId = null,
    permissions = [],
  } = options;

  return {
    scopeType,
    warehouseId,
    employeeRole: {
      id,
      name,
      position,
      permissions: new Set(permissions),
    },
  };
}

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
            roleGrant(position, {
              name: isSuperadmin ? 'superadmin' : 'actor',
              scopeType,
              warehouseId,
              permissions,
            }),
          ],
  };
}

describe('RoleHierarchyService', () => {
  const service = new RoleHierarchyService();

  it('only lets a regular actor manage roles strictly below their global role', () => {
    const actor = access(10, { permissions: ['role:update'] });

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

  it('uses the granting warehouse role position for a system-wide permission', () => {
    const actor = access(10, {
      scopeType: 'WAREHOUSE',
      warehouseId: 12,
      permissions: ['employee:update:info', 'role:update'],
    });

    expect(service.canManageRole(actor, { name: 'lower', position: 9 })).toBe(true);
    expect(service.canManageRole(actor, { name: 'equal', position: 10 })).toBe(false);
  });

  it('combines role positions from the warehouse that grants a system-wide permission', () => {
    const actor: ActorRoleAccess = {
      isSuperadmin: false,
      grants: [
        roleGrant(100, {
          id: 1,
          name: 'warehouse lead',
          scopeType: 'WAREHOUSE',
          warehouseId: 12,
          permissions: ['employee:update:roles', 'employee:update:info'],
        }),
        roleGrant(10, {
          id: 2,
          name: 'role editor',
          scopeType: 'WAREHOUSE',
          warehouseId: 12,
          permissions: ['employee:update:info', 'role:update'],
        }),
      ],
    };

    expect(service.getEffectiveSystemWidePosition(actor, 'role:update')).toBe(100);
    expect(service.canManageRole(actor, { name: 'lower', position: 99 })).toBe(true);
    expect(
      service.canAssignRoleInAnyScope(actor, {
        name: 'lower role editor',
        position: 99,
        permissions: [
          { employeePermission: { name: 'employee:update:info' } },
          { employeePermission: { name: 'role:update' } },
        ],
      }),
    ).toBe(true);
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

  it('grants a system-wide permission globally from a mixed warehouse binding', () => {
    const actor = access(10, {
      scopeType: 'WAREHOUSE',
      warehouseId: 12,
      permissions: ['employee:update:info', 'role:update'],
    });

    expect(service.hasPermissionInContext(actor, 'role:update', { warehouseId: null })).toBe(true);
    expect(service.hasPermissionInContext(actor, 'role:update', { warehouseId: 12 })).toBe(true);
    expect(service.hasPermissionInContext(actor, 'role:update', { warehouseId: 15 })).toBe(true);
  });

  it('keeps all permission categories from a valid mixed warehouse binding', async () => {
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
                name: 'warehouse manager',
                position: 100,
                permissions: [
                  { employeePermission: { name: 'employee:update:info' } },
                  { employeePermission: { name: 'role:update' } },
                  { employeePermission: { name: 'employee:update:own:avatar' } },
                ],
              },
            },
          ],
        }),
      },
    };

    const actor = await service.getActorAccess(client as never, 'actor-id');

    expect(actor.grants).toHaveLength(1);
    expect(actor.grants[0]?.employeeRole.permissions).toEqual(
      new Set(['employee:update:info', 'role:update', 'employee:update:own:avatar']),
    );
    expect(service.hasPermissionInContext(actor, 'employee:update:info', { warehouseId: 12 })).toBe(
      true,
    );
    expect(service.hasPermissionInContext(actor, 'employee:update:info', { warehouseId: 15 })).toBe(
      false,
    );
    expect(service.hasPermissionInContext(actor, 'role:update', { warehouseId: null })).toBe(true);
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
      service.canAssignRoleInAnyScope(access(10, { permissions: ['employee:update:roles'] }), role),
    ).toBe(false);
    expect(
      service.canAssignRoleInAnyScope(access(10, { permissions: ['employee:update:info'] }), role),
    ).toBe(false);
  });

  it('requires both system-wide and warehouse permissions to delegate a mixed role', () => {
    const mixedRole = {
      name: 'warehouse manager',
      position: 9,
      permissions: [
        { employeePermission: { name: 'employee:update:info' } },
        { employeePermission: { name: 'role:create' } },
      ],
    };
    const actor = access(10, {
      scopeType: 'WAREHOUSE',
      warehouseId: 12,
      permissions: ['employee:update:roles', 'employee:update:info', 'role:create'],
    });

    expect(service.canAssignRoleInAnyScope(actor, mixedRole)).toBe(true);
    expect(
      service.canAssignRoleInAnyScope(
        access(10, {
          scopeType: 'WAREHOUSE',
          warehouseId: 12,
          permissions: ['employee:update:roles', 'employee:update:info'],
        }),
        mixedRole,
      ),
    ).toBe(false);
    expect(
      service.canAssignRoleInAnyScope(
        access(10, {
          scopeType: 'WAREHOUSE',
          warehouseId: 12,
          permissions: ['employee:update:roles', 'role:create'],
        }),
        mixedRole,
      ),
    ).toBe(false);
  });

  it('does not use an unrelated warehouse position to delegate role management', () => {
    const actor: ActorRoleAccess = {
      isSuperadmin: false,
      grants: [
        roleGrant(100, {
          id: 1,
          name: 'warehouse lead',
          scopeType: 'WAREHOUSE',
          warehouseId: 12,
          permissions: ['employee:update:roles', 'employee:update:info'],
        }),
        roleGrant(10, {
          id: 2,
          name: 'role editor',
          scopeType: 'WAREHOUSE',
          warehouseId: 15,
          permissions: ['employee:update:info', 'role:update'],
        }),
      ],
    };
    const elevatedMixedRole = {
      name: 'elevated warehouse manager',
      position: 90,
      permissions: [
        { employeePermission: { name: 'employee:update:info' } },
        { employeePermission: { name: 'role:update' } },
      ],
    };

    expect(service.getEffectiveSystemWidePosition(actor, 'role:update')).toBe(10);
    expect(service.canAssignRoleInAnyScope(actor, elevatedMixedRole)).toBe(false);
  });

  it('does not add a positional constraint to non-hierarchical system permissions', () => {
    const actor: ActorRoleAccess = {
      isSuperadmin: false,
      grants: [
        roleGrant(100, {
          id: 1,
          name: 'warehouse lead',
          scopeType: 'WAREHOUSE',
          warehouseId: 12,
          permissions: ['employee:update:roles', 'employee:update:info'],
        }),
        roleGrant(10, {
          id: 2,
          name: 'role creator',
          scopeType: 'WAREHOUSE',
          warehouseId: 15,
          permissions: ['employee:update:info', 'role:create'],
        }),
      ],
    };

    expect(
      service.canAssignRoleInAnyScope(actor, {
        name: 'warehouse manager',
        position: 90,
        permissions: [
          { employeePermission: { name: 'employee:update:info' } },
          { employeePermission: { name: 'role:create' } },
        ],
      }),
    ).toBe(true);
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
