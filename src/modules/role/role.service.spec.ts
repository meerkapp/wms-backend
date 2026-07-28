import { ActorRoleAccess, RoleHierarchyService } from './role-hierarchy.service';
import { RoleService } from './role.service';

describe('RoleService', () => {
  it('returns exact assignable scopes for every role', async () => {
    const access: ActorRoleAccess = { isSuperadmin: false, grants: [] };
    const role = {
      id: 1,
      name: 'warehouse manager',
      color: '#fff',
      position: 10,
      updatedAt: new Date('2026-07-28T00:00:00.000Z'),
      permissions: [{ employeePermission: { id: 1, name: 'employee:update:info' } }],
    };
    const prisma = {
      employeeRole: {
        findMany: jest.fn().mockResolvedValue([role]),
      },
      warehouse: {
        findMany: jest.fn().mockResolvedValue([{ id: 12 }, { id: 15 }]),
      },
    };
    const hierarchy = {
      getActorAccess: jest.fn().mockResolvedValue(access),
      getAssignableRoleScopes: jest.fn().mockReturnValue({
        global: false,
        warehouseIds: [12],
      }),
      canManageRole: jest.fn().mockReturnValue(false),
    };
    const service = new RoleService(prisma as never, hierarchy as unknown as RoleHierarchyService);

    await expect(service.findAll('actor-id')).resolves.toEqual([
      {
        ...role,
        allowedScopeTypes: ['GLOBAL', 'WAREHOUSE'],
        canManage: false,
        assignableScopes: {
          global: false,
          warehouseIds: [12],
        },
        canAssign: true,
      },
    ]);
    expect(hierarchy.getAssignableRoleScopes).toHaveBeenCalledWith(access, role, [12, 15]);
  });

  it('marks permissions as grantable using the actor global access', async () => {
    const access: ActorRoleAccess = { isSuperadmin: false, grants: [] };
    const prisma = {
      employeePermission: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, name: 'employee:update:info' },
          { id: 2, name: 'role:update' },
        ]),
      },
    };
    const hierarchy = {
      getActorAccess: jest.fn().mockResolvedValue(access),
      canDelegatePermission: jest.fn(
        (_access: ActorRoleAccess, permission: string) => permission === 'role:update',
      ),
    };
    const service = new RoleService(prisma as never, hierarchy as unknown as RoleHierarchyService);

    await expect(service.findAllPermissions('actor-id')).resolves.toEqual([
      { id: 1, name: 'employee:update:info', canGrant: false },
      { id: 2, name: 'role:update', canGrant: true },
    ]);
    expect(hierarchy.getActorAccess).toHaveBeenCalledWith(prisma, 'actor-id');
  });
});
