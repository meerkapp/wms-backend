import { ALL_PERMISSIONS, PERMISSION_SCOPE_POLICIES } from '@meerkapp/wms-contracts';
import {
  getAllowedScopeTypes,
  getGrantedPermissionsForAssignment,
  getPermissionScopePolicy,
  isRoleAssignmentScopeAllowed,
} from './permission-scope';

describe('permission scope policy', () => {
  it('defines a policy for every permission', () => {
    expect(Object.keys(PERMISSION_SCOPE_POLICIES).sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('allows warehouse assignments only for roles with resource-scoped permissions', () => {
    expect(getAllowedScopeTypes(['employee:update:info'])).toEqual(['GLOBAL', 'WAREHOUSE']);
    expect(getAllowedScopeTypes(['employee:update:info', 'employee:update:own:avatar'])).toEqual([
      'GLOBAL',
      'WAREHOUSE',
    ]);
    expect(getAllowedScopeTypes(['employee:update:info', 'role:update'])).toEqual([
      'GLOBAL',
      'WAREHOUSE',
    ]);
    expect(getAllowedScopeTypes(['role:update'])).toEqual(['GLOBAL']);
    expect(getAllowedScopeTypes(['employee:update:own:avatar'])).toEqual(['GLOBAL']);
    expect(getAllowedScopeTypes([])).toEqual(['GLOBAL']);
  });

  it('keeps self and system-wide permissions active in a mixed warehouse assignment', () => {
    expect(
      getGrantedPermissionsForAssignment('WAREHOUSE', 'warehouse manager', [
        'employee:update:info',
        'role:update',
        'employee:update:own:avatar',
      ]),
    ).toEqual(['employee:update:info', 'role:update', 'employee:update:own:avatar']);
    expect(
      getGrantedPermissionsForAssignment('WAREHOUSE', 'system manager', ['role:update']),
    ).toBeNull();
    expect(getGrantedPermissionsForAssignment('GLOBAL', 'unknown', ['unknown:permission'])).toEqual(
      [],
    );
    expect(getPermissionScopePolicy('unknown:permission')).toBeNull();
  });

  it('only permits the protected role as a global assignment', () => {
    expect(isRoleAssignmentScopeAllowed('WAREHOUSE', 'superadmin', ['employee:update:info'])).toBe(
      false,
    );
    expect(isRoleAssignmentScopeAllowed('GLOBAL', 'superadmin', ['employee:update:info'])).toBe(
      true,
    );
  });
});
