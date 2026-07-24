import { ForbiddenException } from '@nestjs/common';
import { RoleHierarchyService, ActorRoleAccess } from './role-hierarchy.service';

const access = (highestRolePosition: number | null, isSuperadmin = false): ActorRoleAccess => ({
  highestRolePosition,
  isSuperadmin,
  permissions: new Set(),
});

describe('RoleHierarchyService', () => {
  const service = new RoleHierarchyService();

  it('only lets a regular actor manage roles strictly below their highest role', () => {
    const actor = access(10);

    expect(service.canManageRole(actor, { name: 'lower', position: 9 })).toBe(true);
    expect(service.canManageRole(actor, { name: 'equal', position: 10 })).toBe(false);
    expect(service.canManageRole(actor, { name: 'higher', position: 11 })).toBe(false);
    expect(() => service.assertCanManageRole(actor, { name: 'equal', position: 10 })).toThrow(
      ForbiddenException,
    );
  });

  it('treats superadmin as the owner while keeping its own role immutable', () => {
    const superadmin = access(2_000_000_000, true);

    expect(service.canManageRole(superadmin, { name: 'manager', position: 100 })).toBe(true);
    expect(
      service.canManageRole(superadmin, {
        name: 'superadmin',
        position: 2_000_000_000,
      }),
    ).toBe(false);
    expect(
      service.canAssignRole(superadmin, {
        name: 'superadmin',
        position: 2_000_000_000,
      }),
    ).toBe(true);
  });
});
