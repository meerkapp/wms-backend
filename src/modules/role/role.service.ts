import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { ReorderRolesDto } from './dto/reorder-roles.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PROTECTED_ROLE_NAME, SUPERADMIN_ROLE_POSITION } from './role-hierarchy.constants';
import { ActorRoleAccess, RoleHierarchyService } from './role-hierarchy.service';
import { getAllowedScopeTypes } from './permission-scope';

const ROLE_SELECT = {
  id: true,
  name: true,
  color: true,
  position: true,
  updatedAt: true,
  permissions: {
    select: {
      employeePermission: {
        select: { id: true, name: true },
      },
    },
  },
} as const;

type RoleRow = Prisma.EmployeeRoleGetPayload<{ select: typeof ROLE_SELECT }>;

@Injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchy: RoleHierarchyService,
  ) {}

  async findAll(actorId: string) {
    const [access, roles] = await Promise.all([
      this.hierarchy.getActorAccess(this.prisma, actorId),
      this.findAllWithClient(this.prisma),
    ]);
    return roles.map((role) => this.serializeRole(role, access));
  }

  async findOne(id: number, actorId: string) {
    const [access, role] = await Promise.all([
      this.hierarchy.getActorAccess(this.prisma, actorId),
      this.findOneWithClient(this.prisma, id),
    ]);
    return this.serializeRole(role, access);
  }

  async create(dto: CreateRoleDto, actorId: string) {
    if (dto.name === PROTECTED_ROLE_NAME) {
      throw new BadRequestException(`Role "${dto.name}" is reserved`);
    }

    const { permissionIds, ...roleData } = dto;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.hierarchy.lock(tx);
        const access = await this.hierarchy.getActorAccess(tx, actorId);
        this.hierarchy.assertCurrentPermission(access, 'role:create');
        await this.hierarchy.assertDelegatedPermissions(tx, permissionIds ?? [], access);

        const lowestRole = await tx.employeeRole.aggregate({
          where: { name: { not: PROTECTED_ROLE_NAME } },
          _min: { position: true },
        });
        const position = lowestRole._min.position === null ? 1 : lowestRole._min.position - 1;

        const role = await tx.employeeRole.create({
          data: {
            ...roleData,
            position,
            permissions: permissionIds?.length
              ? {
                  create: permissionIds.map((id) => ({
                    employeePermissionId: id,
                  })),
                }
              : undefined,
          },
          select: ROLE_SELECT,
        });
        return this.serializeRole(role, access);
      });
    } catch (error) {
      this.rethrowRoleNameConflict(error, dto.name);
    }
  }

  async update(id: number, dto: UpdateRoleDto, actorId: string) {
    if (dto.name === PROTECTED_ROLE_NAME) {
      throw new BadRequestException(`Role "${dto.name}" is reserved`);
    }

    const { permissionIds, ...roleData } = dto;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.hierarchy.lock(tx);
        const access = await this.hierarchy.getActorAccess(tx, actorId);
        this.hierarchy.assertCurrentPermission(access, 'role:update');

        const role = await this.findOneWithClient(tx, id);
        this.hierarchy.assertCanManageRole(access, role);
        const requestedPermissions = await this.hierarchy.assertDelegatedPermissions(
          tx,
          permissionIds,
          access,
          role.permissions.map(({ employeePermission }) => employeePermission.id),
        );
        if (
          requestedPermissions !== undefined &&
          !getAllowedScopeTypes(requestedPermissions.map(({ name }) => name)).includes('WAREHOUSE')
        ) {
          const scopedAssignmentCount = await tx.employeeRoleAssignment.count({
            where: { employeeRoleId: id, scopeType: 'WAREHOUSE' },
          });
          if (scopedAssignmentCount > 0) {
            throw new BadRequestException(
              'Remove warehouse role assignments before removing the last resource-scoped permission',
            );
          }
        }

        if (Object.keys(roleData).length > 0) {
          await tx.employeeRole.update({
            where: { id },
            data: roleData,
          });
        }

        if (permissionIds !== undefined) {
          await tx.employeeRolePermission.deleteMany({
            where: { employeeRoleId: id },
          });

          if (permissionIds.length > 0) {
            await tx.employeeRolePermission.createMany({
              data: permissionIds.map((permissionId) => ({
                employeeRoleId: id,
                employeePermissionId: permissionId,
              })),
            });
          }
        }

        const [updated, updatedAccess] = await Promise.all([
          this.findOneWithClient(tx, id),
          this.hierarchy.getActorAccess(tx, actorId),
        ]);
        return this.serializeRole(updated, updatedAccess);
      });
    } catch (error) {
      this.rethrowRoleNameConflict(error, dto.name);
    }
  }

  async reorder(dto: ReorderRolesDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.hierarchy.lock(tx);
      const access = await this.hierarchy.getActorAccess(tx, actorId);
      this.hierarchy.assertCurrentPermission(access, 'role:update');

      const roles = await this.findAllWithClient(tx);
      const manageableRoles = roles.filter((role) => this.hierarchy.canManageRole(access, role));
      const manageableIds = new Set(manageableRoles.map(({ id }) => id));
      if (
        dto.roleIds.length !== manageableIds.size ||
        dto.roleIds.some((id) => !manageableIds.has(id))
      ) {
        throw new BadRequestException(
          'Role order must contain every role below your highest role exactly once',
        );
      }

      const highestManagedPosition = access.isSuperadmin
        ? manageableRoles.length
        : this.hierarchy.getEffectiveSystemWidePosition(access, 'role:update')! - 1;
      for (const [index, roleId] of dto.roleIds.entries()) {
        await tx.employeeRole.update({
          where: { id: roleId },
          data: { position: highestManagedPosition - index },
        });
      }
      await tx.employeeRole.updateMany({
        where: { name: PROTECTED_ROLE_NAME },
        data: { position: SUPERADMIN_ROLE_POSITION },
      });

      const [updatedAccess, updatedRoles] = await Promise.all([
        this.hierarchy.getActorAccess(tx, actorId),
        this.findAllWithClient(tx),
      ]);
      return updatedRoles.map((role) => this.serializeRole(role, updatedAccess));
    });
  }

  async findAllPermissions() {
    return this.prisma.employeePermission.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  private findAllWithClient(client: Prisma.TransactionClient | PrismaService) {
    return client.employeeRole.findMany({
      select: ROLE_SELECT,
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
    });
  }

  private async findOneWithClient(client: Prisma.TransactionClient | PrismaService, id: number) {
    const role = await client.employeeRole.findUnique({
      where: { id },
      select: ROLE_SELECT,
    });
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    return role;
  }

  private serializeRole(role: RoleRow, access: ActorRoleAccess) {
    const permissionNames = role.permissions.map(
      ({ employeePermission }) => employeePermission.name,
    );
    return {
      ...role,
      allowedScopeTypes: getAllowedScopeTypes(permissionNames),
      canManage: this.hierarchy.canManageRole(access, role),
      canAssign: this.hierarchy.canAssignRoleInAnyScope(access, role),
    };
  }

  private rethrowRoleNameConflict(error: unknown, name: string | undefined): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(
        name ? `Role "${name}" already exists` : 'Role name already exists',
      );
    }
    throw error;
  }
}
