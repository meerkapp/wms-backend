import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccessScopeCoverage,
  AccessScopeType,
  EMPLOYEE_ERROR_CODES,
} from '@meerkapp/wms-contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PROTECTED_ROLE_NAME } from './role-hierarchy.constants';
import {
  getAllowedScopeTypes,
  getGrantedPermissionsForAssignment,
  getPermissionScopePolicy,
  isScopeAllowedForPermissions,
} from './permission-scope';

type PrismaClient = Prisma.TransactionClient | PrismaService;

type RoleGrant = {
  scopeType: AccessScopeType;
  warehouseId: number | null;
  employeeRole: {
    id: number;
    name: string;
    position: number;
    permissions: Set<string>;
  };
};

export type ActorRoleAccess = {
  isSuperadmin: boolean;
  grants: RoleGrant[];
};

export type AuthorizationContext = {
  warehouseId: number | null;
};

type HierarchicalRole = {
  name: string;
  position: number;
};

type RoleWithPermissions = HierarchicalRole & {
  permissions: Array<{ employeePermission: { name: string } }>;
};

export type EmployeeAuthorizationTarget = {
  id: string;
  isActive: boolean;
  warehouseId: number | null;
  roleAssignments: Array<{
    employeeRoleId: number;
    scopeType: AccessScopeType;
    warehouseId: number | null;
    employeeRole: {
      name: string;
      position: number;
    };
  }>;
};

export type NormalizedRoleAssignment = {
  roleId: number;
  scopeType: AccessScopeType;
  warehouseId: number | null;
};

export type RoleAssignmentChanges = {
  added: NormalizedRoleAssignment[];
  removed: NormalizedRoleAssignment[];
};

type AssignableRole = {
  id: number;
  name: string;
  position: number;
  permissions: Array<{ employeePermission: { name: string } }>;
};

@Injectable()
export class RoleHierarchyService {
  async lock(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtext('meerkapp:wms'),
        hashtext('role-hierarchy')
      )::text AS lock_result
    `);
  }

  async getActorAccess(client: PrismaClient, actorId: string): Promise<ActorRoleAccess> {
    const actor = await client.employee.findUnique({
      where: { id: actorId },
      select: {
        isActive: true,
        roleAssignments: {
          select: {
            scopeType: true,
            warehouseId: true,
            employeeRole: {
              select: {
                id: true,
                name: true,
                position: true,
                permissions: {
                  select: {
                    employeePermission: {
                      select: { name: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!actor?.isActive) {
      throw new ForbiddenException('The acting employee is inactive or no longer exists');
    }

    const grants = actor.roleAssignments.flatMap(({ scopeType, warehouseId, employeeRole }) => {
      const permissionNames = employeeRole.permissions.map(
        ({ employeePermission }) => employeePermission.name,
      );
      const grantedPermissions = getGrantedPermissionsForAssignment(
        scopeType,
        employeeRole.name,
        permissionNames,
      );
      if (grantedPermissions === null) return [];

      return [
        {
          scopeType,
          warehouseId,
          employeeRole: {
            id: employeeRole.id,
            name: employeeRole.name,
            position: employeeRole.position,
            permissions: new Set(grantedPermissions),
          },
        },
      ];
    });

    return {
      isSuperadmin: grants.some(
        ({ scopeType, employeeRole }) =>
          scopeType === 'GLOBAL' && employeeRole.name === PROTECTED_ROLE_NAME,
      ),
      grants,
    };
  }

  hasPermissionInContext(
    access: ActorRoleAccess,
    permission: string,
    context: AuthorizationContext,
  ): boolean {
    if (access.isSuperadmin) return true;

    const policy = getPermissionScopePolicy(permission);
    if (!policy) return false;

    if (policy === 'SELF') {
      return access.grants.some(({ employeeRole }) => employeeRole.permissions.has(permission));
    }

    if (policy === 'SYSTEM_WIDE') {
      return access.grants.some(({ employeeRole }) => employeeRole.permissions.has(permission));
    }

    return this.grantsForContext(access, context).some(({ employeeRole }) =>
      employeeRole.permissions.has(permission),
    );
  }

  assertCurrentPermission(access: ActorRoleAccess, permission: string): void {
    this.assertPermissionInContext(access, permission, { warehouseId: null });
  }

  canDelegatePermission(access: ActorRoleAccess, permission: string): boolean {
    return this.hasPermissionInContext(access, permission, { warehouseId: null });
  }

  assertPermissionInContext(
    access: ActorRoleAccess,
    permission: string,
    context: AuthorizationContext,
  ): void {
    if (!this.hasPermissionInContext(access, permission, context)) {
      throw new ForbiddenException('The acting employee has no permission in this scope');
    }
  }

  getEffectiveRolePosition(access: ActorRoleAccess, context: AuthorizationContext): number | null {
    const positions = this.grantsForContext(access, context).map(
      ({ employeeRole }) => employeeRole.position,
    );
    return positions.length === 0 ? null : Math.max(...positions);
  }

  getEffectiveSystemWidePosition(access: ActorRoleAccess, permission: string): number | null {
    if (getPermissionScopePolicy(permission) !== 'SYSTEM_WIDE') {
      return null;
    }

    const sourceContexts = new Map<string, AuthorizationContext>();
    for (const grant of access.grants) {
      if (!grant.employeeRole.permissions.has(permission)) continue;

      const warehouseId = grant.scopeType === 'GLOBAL' ? null : grant.warehouseId;
      sourceContexts.set(warehouseId === null ? 'GLOBAL' : `WAREHOUSE:${warehouseId}`, {
        warehouseId,
      });
    }

    const positions = [...sourceContexts.values()].flatMap((context) => {
      const position = this.getEffectiveRolePosition(access, context);
      return position === null ? [] : [position];
    });
    return positions.length === 0 ? null : Math.max(...positions);
  }

  canManageRole(access: ActorRoleAccess, role: HierarchicalRole): boolean {
    if (role.name === PROTECTED_ROLE_NAME) return false;
    if (access.isSuperadmin) return true;

    const highestPosition = this.getEffectiveSystemWidePosition(access, 'role:update');
    return highestPosition !== null && role.position < highestPosition;
  }

  getPermissionScopeCoverage(
    access: ActorRoleAccess,
    permission: string,
    warehouseIds: readonly number[],
  ): AccessScopeCoverage {
    return {
      global: this.hasPermissionInContext(access, permission, { warehouseId: null }),
      warehouseIds: [...new Set(warehouseIds)].filter((warehouseId) =>
        this.hasPermissionInContext(access, permission, { warehouseId }),
      ),
    };
  }

  getAssignableRoleScopes(
    access: ActorRoleAccess,
    role: RoleWithPermissions,
    warehouseIds: readonly number[],
  ): AccessScopeCoverage {
    if (role.name === PROTECTED_ROLE_NAME) {
      return {
        global: access.isSuperadmin,
        warehouseIds: [],
      };
    }

    const permissionNames = role.permissions.map(
      ({ employeePermission }) => employeePermission.name,
    );
    const allowedScopeTypes = getAllowedScopeTypes(permissionNames);
    const uniqueWarehouseIds = [...new Set(warehouseIds)];

    if (access.isSuperadmin) {
      return {
        global: allowedScopeTypes.includes('GLOBAL'),
        warehouseIds: allowedScopeTypes.includes('WAREHOUSE') ? uniqueWarehouseIds : [],
      };
    }

    return {
      global:
        allowedScopeTypes.includes('GLOBAL') &&
        this.canAssignRoleInContext(access, role, { warehouseId: null }),
      warehouseIds: allowedScopeTypes.includes('WAREHOUSE')
        ? uniqueWarehouseIds.filter((warehouseId) =>
            this.canAssignRoleInContext(access, role, { warehouseId }),
          )
        : [],
    };
  }

  canAssignRoleInAnyScope(access: ActorRoleAccess, role: RoleWithPermissions): boolean {
    const warehouseIds = [
      ...new Set(
        access.grants.flatMap(({ scopeType, warehouseId }) =>
          scopeType === 'WAREHOUSE' && warehouseId !== null ? [warehouseId] : [],
        ),
      ),
    ];
    const scopes = this.getAssignableRoleScopes(access, role, warehouseIds);
    return scopes.global || scopes.warehouseIds.length > 0;
  }

  assertCanManageRole(access: ActorRoleAccess, role: HierarchicalRole): void {
    if (!this.canManageRole(access, role)) {
      throw new ForbiddenException('Cannot manage a role at or above your effective role position');
    }
  }

  async assertDelegatedPermissions(
    client: PrismaClient,
    permissionIds: number[] | undefined,
    access: ActorRoleAccess,
    existingPermissionIds: number[] = [],
  ): Promise<Array<{ id: number; name: string }> | undefined> {
    if (permissionIds === undefined) return undefined;

    const uniquePermissionIds = [...new Set(permissionIds)];
    const requestedPermissions = await client.employeePermission.findMany({
      where: { id: { in: uniquePermissionIds } },
      select: { id: true, name: true },
    });
    if (requestedPermissions.length !== uniquePermissionIds.length) {
      throw new BadRequestException('One or more permissions do not exist');
    }

    const existingPermissionIdSet = new Set(existingPermissionIds);
    if (
      requestedPermissions.some(
        ({ id, name }) =>
          !existingPermissionIdSet.has(id) && !this.canDelegatePermission(access, name),
      )
    ) {
      throw new ForbiddenException('Cannot delegate permissions you do not have globally');
    }

    return requestedPermissions;
  }

  async getEmployeeAuthorizationTarget(
    client: PrismaClient,
    targetId: string,
  ): Promise<EmployeeAuthorizationTarget> {
    const target = await client.employee.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        isActive: true,
        warehouseId: true,
        roleAssignments: {
          select: {
            employeeRoleId: true,
            scopeType: true,
            warehouseId: true,
            employeeRole: {
              select: {
                name: true,
                position: true,
              },
            },
          },
        },
      },
    });
    if (!target) throw new NotFoundException(`Employee ${targetId} not found`);
    return target;
  }

  assertCanManageEmployee(
    access: ActorRoleAccess,
    target: EmployeeAuthorizationTarget,
    context: AuthorizationContext = { warehouseId: target.warehouseId },
  ): void {
    if (access.isSuperadmin) return;

    const targetRoles = target.roleAssignments.map(({ employeeRole }) => employeeRole);
    const targetIsSuperadmin = targetRoles.some(({ name }) => name === PROTECTED_ROLE_NAME);
    const targetHighestPosition =
      targetRoles.length === 0 ? null : Math.max(...targetRoles.map(({ position }) => position));
    const actorPosition = this.getEffectiveRolePosition(access, context);

    if (
      targetIsSuperadmin ||
      actorPosition === null ||
      (targetHighestPosition !== null && targetHighestPosition >= actorPosition)
    ) {
      throw new ForbiddenException('Cannot manage an employee with an equal or higher role');
    }
  }

  async assertCanDeactivateEmployee(
    client: PrismaClient,
    target: EmployeeAuthorizationTarget,
  ): Promise<void> {
    if (!target.isActive || !this.hasGlobalProtectedRole(target)) return;

    const activeSuperadminCount = await client.employeeRoleAssignment.count({
      where: {
        employeeId: { not: target.id },
        scopeType: 'GLOBAL',
        employeeRole: { name: PROTECTED_ROLE_NAME },
        employee: { isActive: true },
      },
    });
    if (activeSuperadminCount === 0) {
      throw new ForbiddenException('Cannot deactivate the last active superadmin');
    }
  }

  async authorizeRoleAssignmentReplacement(
    client: PrismaClient,
    target: EmployeeAuthorizationTarget | null,
    existingAssignments: NormalizedRoleAssignment[],
    requestedAssignments: NormalizedRoleAssignment[],
    access: ActorRoleAccess,
  ): Promise<RoleAssignmentChanges> {
    this.assertUniqueRoleAssignments(requestedAssignments);

    const roleIds = [
      ...new Set([...existingAssignments, ...requestedAssignments].map(({ roleId }) => roleId)),
    ];
    const roles = await client.employeeRole.findMany({
      where: { id: { in: roleIds } },
      select: {
        id: true,
        name: true,
        position: true,
        permissions: {
          select: {
            employeePermission: {
              select: { name: true },
            },
          },
        },
      },
    });
    if (roles.length !== roleIds.length) {
      throw this.invalidRoleAssignments('One or more roles do not exist');
    }

    await this.assertWarehousesExist(client, requestedAssignments);
    const roleById = new Map(roles.map((role) => [role.id, role]));

    for (const assignment of requestedAssignments) {
      const role = roleById.get(assignment.roleId)!;
      const permissionNames = role.permissions.map(
        ({ employeePermission }) => employeePermission.name,
      );
      if (!isScopeAllowedForPermissions(assignment.scopeType, permissionNames)) {
        throw this.invalidRoleAssignments(`Role ${role.id} has no resource-scoped permissions`);
      }
      if (role.name === PROTECTED_ROLE_NAME && assignment.scopeType !== 'GLOBAL') {
        throw this.invalidRoleAssignments('The protected role must be assigned globally');
      }
    }

    const existingByKey = new Map(
      existingAssignments.map((assignment) => [this.assignmentKey(assignment), assignment]),
    );
    const requestedByKey = new Map(
      requestedAssignments.map((assignment) => [this.assignmentKey(assignment), assignment]),
    );

    const removed = existingAssignments.filter(
      (assignment) => !requestedByKey.has(this.assignmentKey(assignment)),
    );
    const added = requestedAssignments.filter(
      (assignment) => !existingByKey.has(this.assignmentKey(assignment)),
    );

    if (target !== null) {
      const changedContexts = new Map<number | null, AuthorizationContext>();
      for (const assignment of [...removed, ...added]) {
        changedContexts.set(assignment.warehouseId, {
          warehouseId: assignment.warehouseId,
        });
      }
      for (const context of changedContexts.values()) {
        this.assertCanManageEmployee(access, target, context);
      }
    }

    for (const assignment of removed) {
      this.assertCanRemoveRoleAssignment(access, roleById.get(assignment.roleId)!, assignment);
    }
    for (const assignment of added) {
      this.assertCanAddRoleAssignment(access, roleById.get(assignment.roleId)!, assignment);
    }

    if (
      target !== null &&
      removed.some((assignment) => roleById.get(assignment.roleId)?.name === PROTECTED_ROLE_NAME)
    ) {
      const protectedRole = roles.find(({ name }) => name === PROTECTED_ROLE_NAME)!;
      const remainingProtectedAssignments = await client.employeeRoleAssignment.count({
        where: {
          employeeRoleId: protectedRole.id,
          scopeType: 'GLOBAL',
          employeeId: { not: target.id },
          employee: { isActive: true },
        },
      });
      if (remainingProtectedAssignments === 0) {
        throw new ForbiddenException('Cannot remove the last active superadmin assignment');
      }
    }

    return { added, removed };
  }

  private grantsForContext(access: ActorRoleAccess, context: AuthorizationContext): RoleGrant[] {
    return access.grants.filter(
      (grant) =>
        grant.scopeType === 'GLOBAL' ||
        (context.warehouseId !== null &&
          grant.scopeType === 'WAREHOUSE' &&
          grant.warehouseId === context.warehouseId),
    );
  }

  private assertCanRemoveRoleAssignment(
    access: ActorRoleAccess,
    role: AssignableRole,
    assignment: NormalizedRoleAssignment,
  ): void {
    if (role.name === PROTECTED_ROLE_NAME && !access.isSuperadmin) {
      throw new ForbiddenException('Only superadmin can remove the protected role');
    }
    if (access.isSuperadmin) return;

    const context = { warehouseId: assignment.warehouseId };
    this.assertPermissionInContext(access, 'employee:update:roles', context);
    const actorPosition = this.getEffectiveRolePosition(access, context);
    if (actorPosition === null || role.position >= actorPosition) {
      throw new ForbiddenException('Cannot remove a role at or above your role in this scope');
    }
  }

  private assertCanAddRoleAssignment(
    access: ActorRoleAccess,
    role: AssignableRole,
    assignment: NormalizedRoleAssignment,
  ): void {
    if (role.name === PROTECTED_ROLE_NAME && !access.isSuperadmin) {
      throw new ForbiddenException('Only superadmin can assign the protected role');
    }
    if (access.isSuperadmin) return;

    const context = { warehouseId: assignment.warehouseId };
    this.assertPermissionInContext(access, 'employee:update:roles', context);
    const actorPosition = this.getEffectiveRolePosition(access, context);
    if (actorPosition === null || role.position >= actorPosition) {
      throw new ForbiddenException('Cannot assign a role at or above your role in this scope');
    }

    const missingPermission = role.permissions.find(
      ({ employeePermission }) =>
        !this.hasPermissionInContext(access, employeePermission.name, context),
    );
    if (missingPermission) {
      throw new ForbiddenException(
        'Cannot assign a role containing permissions you do not have in this scope',
      );
    }
    if (!this.canDelegateRoleHierarchy(access, role)) {
      throw new ForbiddenException(
        'Cannot assign role management at or above your effective role position',
      );
    }
  }

  private canDelegateRoleHierarchy(
    access: ActorRoleAccess,
    role: AssignableRole | RoleWithPermissions,
  ): boolean {
    const grantsRoleManagement = role.permissions.some(
      ({ employeePermission }) => employeePermission.name === 'role:update',
    );
    return !grantsRoleManagement || this.canManageRole(access, role);
  }

  private async assertWarehousesExist(
    client: PrismaClient,
    assignments: NormalizedRoleAssignment[],
  ): Promise<void> {
    const warehouseIds = [
      ...new Set(
        assignments.flatMap(({ scopeType, warehouseId }) =>
          scopeType === 'WAREHOUSE' && warehouseId !== null ? [warehouseId] : [],
        ),
      ),
    ];
    if (warehouseIds.length === 0) return;

    const warehouseCount = await client.warehouse.count({
      where: { id: { in: warehouseIds } },
    });
    if (warehouseCount !== warehouseIds.length) {
      throw this.invalidRoleAssignments('One or more assignment warehouses do not exist');
    }
  }

  private assertUniqueRoleAssignments(assignments: NormalizedRoleAssignment[]): void {
    const keys = assignments.map((assignment) => this.assignmentKey(assignment));
    if (new Set(keys).size !== keys.length) {
      throw this.invalidRoleAssignments('Role assignments must be unique');
    }

    const globalRoleIds = new Set(
      assignments.filter(({ scopeType }) => scopeType === 'GLOBAL').map(({ roleId }) => roleId),
    );
    if (
      assignments.some(
        ({ roleId, scopeType }) => scopeType === 'WAREHOUSE' && globalRoleIds.has(roleId),
      )
    ) {
      throw this.invalidRoleAssignments(
        'A global role assignment cannot be combined with warehouse assignments',
      );
    }
  }

  private canAssignRoleInContext(
    access: ActorRoleAccess,
    role: RoleWithPermissions,
    context: AuthorizationContext,
  ): boolean {
    const position = this.getEffectiveRolePosition(access, context);
    return (
      this.hasPermissionInContext(access, 'employee:update:roles', context) &&
      position !== null &&
      role.position < position &&
      role.permissions.every(({ employeePermission }) =>
        this.hasPermissionInContext(access, employeePermission.name, context),
      ) &&
      this.canDelegateRoleHierarchy(access, role)
    );
  }

  private invalidRoleAssignments(message: string): BadRequestException {
    return new BadRequestException({
      code: EMPLOYEE_ERROR_CODES.invalidRoleAssignments,
      message,
    });
  }

  private hasGlobalProtectedRole(target: EmployeeAuthorizationTarget): boolean {
    return target.roleAssignments.some(
      ({ scopeType, employeeRole }) =>
        scopeType === 'GLOBAL' && employeeRole.name === PROTECTED_ROLE_NAME,
    );
  }

  private assignmentKey(assignment: NormalizedRoleAssignment): string {
    return assignment.scopeType === 'GLOBAL'
      ? `${assignment.roleId}:GLOBAL`
      : `${assignment.roleId}:WAREHOUSE:${assignment.warehouseId}`;
  }
}
