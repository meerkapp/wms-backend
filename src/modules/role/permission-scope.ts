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

export function isPermissionGrantedByScope(
  permission: string,
  scopeType: AccessScopeType,
): boolean {
  const policy = getPermissionScopePolicy(permission);
  if (!policy) return false;
  if (scopeType === 'GLOBAL') return true;

  return policy === 'RESOURCE_SCOPED' || policy === 'SELF';
}

export function getAllowedScopeTypes(permissionNames: readonly string[]): AccessScopeType[] {
  const policies = permissionNames.map(getPermissionScopePolicy);
  const requiresGlobal = policies.some(
    (policy) => policy !== 'RESOURCE_SCOPED' && policy !== 'SELF',
  );
  const hasResourceScopedPermission = policies.includes('RESOURCE_SCOPED');

  return requiresGlobal || !hasResourceScopedPermission ? ['GLOBAL'] : [...ACCESS_SCOPE_TYPES];
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
