import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PROTECTED_ROLE_NAME } from './role-hierarchy.constants';

type PrismaClient = Prisma.TransactionClient | PrismaService;

export type ActorRoleAccess = {
  isSuperadmin: boolean;
  highestRolePosition: number | null;
  permissions: Set<string>;
};

type HierarchicalRole = {
  name: string;
  position: number;
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
            employeeRole: {
              select: {
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

    const roles = actor.roleAssignments.map(({ employeeRole }) => employeeRole);
    return {
      isSuperadmin: roles.some(({ name }) => name === PROTECTED_ROLE_NAME),
      highestRolePosition:
        roles.length === 0 ? null : Math.max(...roles.map(({ position }) => position)),
      permissions: new Set(
        roles.flatMap(({ permissions }) =>
          permissions.map(({ employeePermission }) => employeePermission.name),
        ),
      ),
    };
  }

  assertCurrentPermission(access: ActorRoleAccess, permission: string): void {
    if (!access.isSuperadmin && !access.permissions.has(permission)) {
      throw new ForbiddenException('The acting employee no longer has permission for this action');
    }
  }

  canManageRole(access: ActorRoleAccess, role: HierarchicalRole): boolean {
    if (role.name === PROTECTED_ROLE_NAME) return false;
    if (access.isSuperadmin) return true;
    return access.highestRolePosition !== null && role.position < access.highestRolePosition;
  }

  canAssignRole(access: ActorRoleAccess, role: HierarchicalRole): boolean {
    return access.isSuperadmin || this.canManageRole(access, role);
  }

  assertCanManageRole(access: ActorRoleAccess, role: HierarchicalRole): void {
    if (!this.canManageRole(access, role)) {
      throw new ForbiddenException('Cannot manage a role at or above your highest role');
    }
  }

  async assertDelegatedPermissions(
    client: PrismaClient,
    permissionIds: number[] | undefined,
    access: ActorRoleAccess,
    existingPermissionIds: number[] = [],
  ): Promise<void> {
    if (permissionIds === undefined) return;

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
      !access.isSuperadmin &&
      requestedPermissions.some(
        ({ id, name }) => !existingPermissionIdSet.has(id) && !access.permissions.has(name),
      )
    ) {
      throw new ForbiddenException('Cannot delegate permissions you do not have');
    }
  }

  async assertAssignableRoles(
    client: PrismaClient,
    roleIds: number[],
    access: ActorRoleAccess,
  ): Promise<void> {
    const uniqueRoleIds = [...new Set(roleIds)];
    const roles = await client.employeeRole.findMany({
      where: { id: { in: uniqueRoleIds } },
      select: {
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
    if (roles.length !== uniqueRoleIds.length) {
      throw new BadRequestException('One or more roles do not exist');
    }
    if (roles.some((role) => !this.canAssignRole(access, role))) {
      throw new ForbiddenException('Cannot assign a role at or above your highest role');
    }
    if (access.isSuperadmin) return;
    if (
      roles.some(({ permissions }) =>
        permissions.some(
          ({ employeePermission }) => !access.permissions.has(employeePermission.name),
        ),
      )
    ) {
      throw new ForbiddenException('Cannot assign roles containing permissions you do not have');
    }
  }

  async assertCanManageEmployee(
    client: PrismaClient,
    targetId: string,
    access: ActorRoleAccess,
  ): Promise<void> {
    if (access.isSuperadmin) return;

    const target = await client.employee.findUnique({
      where: { id: targetId },
      select: {
        roleAssignments: {
          select: {
            employeeRole: {
              select: { name: true, position: true },
            },
          },
        },
      },
    });
    if (!target) throw new NotFoundException(`Employee ${targetId} not found`);

    const targetRoles = target.roleAssignments.map(({ employeeRole }) => employeeRole);
    const targetIsSuperadmin = targetRoles.some(({ name }) => name === PROTECTED_ROLE_NAME);
    const targetHighestPosition =
      targetRoles.length === 0 ? null : Math.max(...targetRoles.map(({ position }) => position));

    if (
      targetIsSuperadmin ||
      access.highestRolePosition === null ||
      (targetHighestPosition !== null && targetHighestPosition >= access.highestRolePosition)
    ) {
      throw new ForbiddenException('Cannot manage an employee with an equal or higher role');
    }
  }
}
