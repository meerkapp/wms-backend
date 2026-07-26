import { ALL_PERMISSIONS, PERMISSION_SCOPE_POLICIES } from '@meerkapp/wms-contracts';
import {
  getAllowedScopeTypes,
  getPermissionScopePolicy,
  isPermissionGrantedByScope,
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
    expect(getAllowedScopeTypes(['role:update'])).toEqual(['GLOBAL']);
    expect(getAllowedScopeTypes(['employee:update:own:avatar'])).toEqual(['GLOBAL']);
    expect(getAllowedScopeTypes([])).toEqual(['GLOBAL']);
  });

  it('keeps self permissions scope-neutral and rejects unknown permissions', () => {
    expect(isPermissionGrantedByScope('employee:update:own:avatar', 'WAREHOUSE')).toBe(true);
    expect(isPermissionGrantedByScope('role:update', 'WAREHOUSE')).toBe(false);
    expect(isPermissionGrantedByScope('unknown:permission', 'GLOBAL')).toBe(false);
    expect(getPermissionScopePolicy('unknown:permission')).toBeNull();
  });

  it('only permits the protected role as a global assignment', () => {
    expect(
      isRoleAssignmentScopeAllowed('WAREHOUSE', 'superadmin', [
        'employee:update:info',
      ]),
    ).toBe(false);
    expect(
      isRoleAssignmentScopeAllowed('GLOBAL', 'superadmin', ['employee:update:info']),
    ).toBe(true);
  });
});
