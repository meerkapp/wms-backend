import { RoleHierarchyService } from '../role/role-hierarchy.service';
import { EmployeeService } from './employee.service';

describe('EmployeeService', () => {
  it('returns exact warehouse coverage for employee management operations', async () => {
    const access = { isSuperadmin: false, grants: [] };
    const prisma = {
      warehouse: {
        findMany: jest.fn().mockResolvedValue([{ id: 12 }, { id: 15 }]),
      },
    };
    const hierarchy = {
      getActorAccess: jest.fn().mockResolvedValue(access),
      getPermissionScopeCoverage: jest
        .fn()
        .mockReturnValueOnce({ global: false, warehouseIds: [12] })
        .mockReturnValueOnce({ global: true, warehouseIds: [12, 15] }),
    };
    const service = new EmployeeService(
      prisma as never,
      {} as never,
      hierarchy as unknown as RoleHierarchyService,
    );

    await expect(service.getManagementScopes('actor-id')).resolves.toEqual({
      create: { global: false, warehouseIds: [12] },
      updateWarehouse: { global: true, warehouseIds: [12, 15] },
    });
    expect(hierarchy.getPermissionScopeCoverage).toHaveBeenNthCalledWith(
      1,
      access,
      'employee:create',
      [12, 15],
    );
    expect(hierarchy.getPermissionScopeCoverage).toHaveBeenNthCalledWith(
      2,
      access,
      'employee:update:warehouse',
      [12, 15],
    );
  });
});
