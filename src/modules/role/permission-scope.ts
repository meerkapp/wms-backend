import {
  ACCESS_SCOPE_TYPES,
  AccessScopeType,
  PERMISSION_SCOPE_POLICIES,
  Permission,
  PermissionScopePolicy,
} from '@meerkapp/wms-contracts';
import { PROTECTED_ROLE_NAME } from './role-hierarchy.constants';

const permissionNames = new Set<string>(Object.keys(PERMISSION_SCOPE_POLICIES));

export function getPermissionScopePolicy(permission: string): PermissionScopePolicy | null {
  if (!permissionNames.has(permission)) return null;
  return PERMISSION_SCOPE_POLICIES[permission as Permission];
}

export function getAllowedScopeTypes(permissionNames: readonly string[]): AccessScopeType[] {
  const policies = permissionNames.map(getPermissionScopePolicy);
  const hasUnknownPermission = policies.includes(null);
  const hasResourceScopedPermission = policies.includes('RESOURCE_SCOPED');

  return !hasUnknownPermission && hasResourceScopedPermission
    ? [...ACCESS_SCOPE_TYPES]
    : ['GLOBAL'];
}

export function isScopeAllowedForPermissions(
  scopeType: AccessScopeType,
  permissionNames: readonly string[],
): boolean {
  return getAllowedScopeTypes(permissionNames).includes(scopeType);
}

export function isRoleAssignmentScopeAllowed(
  scopeType: AccessScopeType,
  roleName: string,
  permissionNames: readonly string[],
): boolean {
  return (
    isScopeAllowedForPermissions(scopeType, permissionNames) &&
    (scopeType === 'GLOBAL' || roleName !== PROTECTED_ROLE_NAME)
  );
}

export function getGrantedPermissionsForAssignment(
  scopeType: AccessScopeType,
  roleName: string,
  permissionNames: readonly string[],
): string[] | null {
  if (!isRoleAssignmentScopeAllowed(scopeType, roleName, permissionNames)) return null;
  return permissionNames.filter((permission) => getPermissionScopePolicy(permission) !== null);
}
