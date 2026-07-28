import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { EmployeeRoleAssignmentInput, Permission } from '@meerkapp/wms-contracts';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import {
  NormalizedRoleAssignment,
  RoleAssignmentChanges,
  RoleHierarchyService,
} from '../role/role-hierarchy.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateOwnPasswordDto, UpdateOwnProfileDto } from './dto/update-own-profile.dto';

const EMPLOYEE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  avatarUrl: true,
  isActive: true,
  warehouseId: true,
  lastSeen: true,
  updatedAt: true,
  roleAssignments: {
    select: {
      id: true,
      scopeType: true,
      warehouseId: true,
      employeeRole: {
        select: {
          id: true,
          name: true,
          color: true,
          position: true,
          updatedAt: true,
        },
      },
    },
  },
} as const;

const AVATAR_FILE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function hasValidAvatarSignature(file: Express.Multer.File): boolean {
  const { buffer, mimetype } = file;

  if (mimetype === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === 'image/png') {
    return buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, 8).equals(PNG_SIGNATURE);
  }
  if (mimetype === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  return false;
}

type EmployeeWithAvatar = { avatarUrl: string | null };

function normalizeRoleAssignments(
  roleAssignments: EmployeeRoleAssignmentInput[] | undefined,
): NormalizedRoleAssignment[] | undefined {
  return roleAssignments?.map((assignment) => ({
    roleId: assignment.roleId,
    scopeType: assignment.scopeType,
    warehouseId: assignment.scopeType === 'WAREHOUSE' ? assignment.warehouseId : null,
  }));
}

@Injectable()
export class EmployeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly hierarchy: RoleHierarchyService,
  ) {}

  async getManagementScopes(actorId: string) {
    const [access, warehouses] = await Promise.all([
      this.hierarchy.getActorAccess(this.prisma, actorId),
      this.prisma.warehouse.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    const warehouseIds = warehouses.map(({ id }) => id);

    return {
      create: this.hierarchy.getPermissionScopeCoverage(access, 'employee:create', warehouseIds),
      updateWarehouse: this.hierarchy.getPermissionScopeCoverage(
        access,
        'employee:update:warehouse',
        warehouseIds,
      ),
    };
  }

  async create(dto: CreateEmployeeDto, actorId: string) {
    const { password, roleAssignments, ...employeeData } = dto;
    const requestedAssignments = normalizeRoleAssignments(roleAssignments) ?? [];
    const warehouseId = employeeData.warehouseId ?? null;
    await this.assertCanCreateEmployee(actorId, warehouseId);
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const employee = await this.prisma.$transaction(async (tx) => {
        await this.hierarchy.lock(tx);
        const actorAccess = await this.hierarchy.getActorAccess(tx, actorId);
        await this.assertWarehouseExists(tx, warehouseId);
        this.hierarchy.assertPermissionInContext(actorAccess, 'employee:create', { warehouseId });
        if (requestedAssignments.length > 0) {
          this.hierarchy.assertPermissionInContext(actorAccess, 'employee:update:roles', {
            warehouseId,
          });
          await this.hierarchy.authorizeRoleAssignmentReplacement(
            tx,
            null,
            [],
            requestedAssignments,
            actorAccess,
          );
        }

        const employee = await tx.employee.create({
          data: { ...employeeData, password: hashedPassword },
        });

        if (requestedAssignments.length > 0) {
          await tx.employeeRoleAssignment.createMany({
            data: requestedAssignments.map((assignment) => ({
              employeeId: employee.id,
              employeeRoleId: assignment.roleId,
              scopeType: assignment.scopeType,
              warehouseId: assignment.warehouseId,
            })),
          });
        }

        return tx.employee.findUniqueOrThrow({
          where: { id: employee.id },
          select: EMPLOYEE_SELECT,
        });
      });

      return this.withPublicAvatar(employee);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email already in use');
      }
      throw error;
    }
  }

  async findAll(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({
        select: EMPLOYEE_SELECT,
        orderBy: { lastName: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.employee.count(),
    ]);

    return {
      items: items.map((employee) => this.withPublicAvatar(employee)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: EMPLOYEE_SELECT,
    });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    return this.withPublicAvatar(employee);
  }

  async update(id: string, dto: UpdateEmployeeDto, actorId: string) {
    const {
      roleAssignments,
      newPassword,
      email,
      firstName,
      lastName,
      phone,
      warehouseId,
      isActive,
    } = dto;
    const requestedAssignments = normalizeRoleAssignments(roleAssignments);

    const permissionRequirements = [
      {
        applies: firstName !== undefined || lastName !== undefined || phone !== undefined,
        permission: 'employee:update:info',
      },
      {
        applies: email !== undefined,
        permission: 'employee:update:email',
      },
      {
        applies: newPassword !== undefined,
        permission: 'employee:update:password',
      },
      {
        applies: isActive !== undefined,
        permission: 'employee:toggle:active',
      },
    ] as const;

    let hashedNewPassword: string | undefined;
    if (newPassword !== undefined) {
      await this.assertCanManageTargetWithPermission(actorId, id, 'employee:update:password');
      hashedNewPassword = await bcrypt.hash(newPassword, 10);
    }

    try {
      const employee = await this.prisma.$transaction(async (tx) => {
        await this.hierarchy.lock(tx);
        const actorAccess = await this.hierarchy.getActorAccess(tx, actorId);
        const target = await this.hierarchy.getEmployeeAuthorizationTarget(tx, id);
        let assignmentChanges: RoleAssignmentChanges | undefined;
        this.hierarchy.assertCanManageEmployee(actorAccess, target);

        for (const requirement of permissionRequirements) {
          if (requirement.applies) {
            this.hierarchy.assertPermissionInContext(actorAccess, requirement.permission, {
              warehouseId: target.warehouseId,
            });
          }
        }

        if (isActive === false) {
          await this.hierarchy.assertCanDeactivateEmployee(tx, target);
        }

        if (warehouseId !== undefined) {
          await this.assertWarehouseExists(tx, warehouseId);
          this.hierarchy.assertPermissionInContext(actorAccess, 'employee:update:warehouse', {
            warehouseId: target.warehouseId,
          });
          this.hierarchy.assertPermissionInContext(actorAccess, 'employee:update:warehouse', {
            warehouseId,
          });
          this.hierarchy.assertCanManageEmployee(actorAccess, target, { warehouseId });
        }

        if (requestedAssignments !== undefined) {
          this.hierarchy.assertPermissionInContext(actorAccess, 'employee:update:roles', {
            warehouseId: target.warehouseId,
          });
          const existingAssignments = target.roleAssignments.map(
            ({ employeeRoleId, scopeType, warehouseId: assignmentWarehouseId }) => ({
              roleId: employeeRoleId,
              scopeType,
              warehouseId: assignmentWarehouseId,
            }),
          );
          assignmentChanges = await this.hierarchy.authorizeRoleAssignmentReplacement(
            tx,
            target,
            existingAssignments,
            requestedAssignments,
            actorAccess,
          );
        }

        const employee = await tx.employee.findUnique({ where: { id } });
        if (!employee) throw new NotFoundException(`Employee ${id} not found`);

        const dataToUpdate: Record<string, unknown> = {};
        if (firstName !== undefined) dataToUpdate.firstName = firstName;
        if (lastName !== undefined) dataToUpdate.lastName = lastName;
        if (phone !== undefined) dataToUpdate.phone = phone;
        if (warehouseId !== undefined) dataToUpdate.warehouseId = warehouseId;
        if (isActive !== undefined) dataToUpdate.isActive = isActive;
        if (email !== undefined) dataToUpdate.email = email;
        if (hashedNewPassword !== undefined) dataToUpdate.password = hashedNewPassword;

        if (Object.keys(dataToUpdate).length > 0) {
          await tx.employee.update({ where: { id }, data: dataToUpdate });
        }

        if (assignmentChanges !== undefined) {
          if (assignmentChanges.removed.length > 0) {
            await tx.employeeRoleAssignment.deleteMany({
              where: {
                employeeId: id,
                OR: assignmentChanges.removed.map((assignment) => ({
                  employeeRoleId: assignment.roleId,
                  scopeType: assignment.scopeType,
                  warehouseId: assignment.warehouseId,
                })),
              },
            });
          }
          if (assignmentChanges.added.length > 0) {
            await tx.employeeRoleAssignment.createMany({
              data: assignmentChanges.added.map((assignment) => ({
                employeeId: id,
                employeeRoleId: assignment.roleId,
                scopeType: assignment.scopeType,
                warehouseId: assignment.warehouseId,
              })),
            });
          }
        }

        return tx.employee.findUniqueOrThrow({ where: { id }, select: EMPLOYEE_SELECT });
      });

      return this.withPublicAvatar(employee);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email already in use');
      }
      throw error;
    }
  }

  async updateOwnProfile(id: string, dto: UpdateOwnProfileDto, permissions: string[]) {
    const { firstName, lastName, phone, email } = dto;

    if (
      (firstName !== undefined || lastName !== undefined || phone !== undefined) &&
      !permissions.includes('employee:update:own:info')
    ) {
      throw new ForbiddenException('No permission to update info');
    }
    if (email !== undefined && !permissions.includes('employee:update:own:email')) {
      throw new ForbiddenException('No permission to update email');
    }

    const dataToUpdate: Record<string, unknown> = {};

    if (firstName !== undefined) dataToUpdate.firstName = firstName;
    if (lastName !== undefined) dataToUpdate.lastName = lastName;
    if (phone !== undefined) dataToUpdate.phone = phone;

    if (email !== undefined) {
      const existing = await this.prisma.employee.findUnique({ where: { email } });
      if (existing && existing.id !== id) throw new ConflictException('Email already in use');
      dataToUpdate.email = email;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return this.findOne(id);
    }

    const employee = await this.prisma.employee.update({
      where: { id },
      data: dataToUpdate,
      select: EMPLOYEE_SELECT,
    });

    return this.withPublicAvatar(employee);
  }

  async updateOwnPassword(id: string, dto: UpdateOwnPasswordDto) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException('Employee not found');

    const valid = await bcrypt.compare(dto.currentPassword, employee.password);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.employee.update({
      where: { id },
      data: { password: hashed },
    });

    return { success: true };
  }

  async uploadAvatar(
    id: string,
    file: Express.Multer.File,
    actorId?: string,
  ): Promise<{ avatarUrl: string }> {
    if (actorId) {
      await this.assertCanManageTargetWithPermission(actorId, id, 'employee:update:avatar');
    }

    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);

    const extension = AVATAR_FILE_EXTENSIONS[file.mimetype];
    if (!extension || !hasValidAvatarSignature(file)) {
      throw new BadRequestException('Unsupported avatar image type');
    }

    const key = `avatars/${id}/${randomUUID()}.${extension}`;
    const avatarUrl = await this.storage.upload(key, file.buffer, file.mimetype);

    try {
      await this.prisma.$transaction(async (tx) => {
        if (actorId) {
          await this.hierarchy.lock(tx);
          const actorAccess = await this.hierarchy.getActorAccess(tx, actorId);
          const target = await this.hierarchy.getEmployeeAuthorizationTarget(tx, id);
          this.hierarchy.assertPermissionInContext(actorAccess, 'employee:update:avatar', {
            warehouseId: target.warehouseId,
          });
          this.hierarchy.assertCanManageEmployee(actorAccess, target);
        }
        await tx.employee.update({
          where: { id },
          data: { avatarUrl },
        });
      });
    } catch (error) {
      await this.storage.delete(key);
      throw error;
    }

    if (employee.avatarUrl) {
      const oldKey = this.storage.getObjectKey(employee.avatarUrl);
      if (oldKey) await this.storage.delete(oldKey);
    }

    return { avatarUrl };
  }

  async deleteAvatar(id: string, actorId?: string): Promise<{ avatarUrl: null }> {
    const employee = await this.prisma.$transaction(async (tx) => {
      if (actorId) {
        await this.hierarchy.lock(tx);
        const actorAccess = await this.hierarchy.getActorAccess(tx, actorId);
        const target = await this.hierarchy.getEmployeeAuthorizationTarget(tx, id);
        this.hierarchy.assertPermissionInContext(actorAccess, 'employee:update:avatar', {
          warehouseId: target.warehouseId,
        });
        this.hierarchy.assertCanManageEmployee(actorAccess, target);
      }

      const employee = await tx.employee.findUnique({ where: { id } });
      if (!employee) throw new NotFoundException(`Employee ${id} not found`);
      await tx.employee.update({
        where: { id },
        data: { avatarUrl: null },
      });
      return employee;
    });

    if (employee.avatarUrl) {
      const key = this.storage.getObjectKey(employee.avatarUrl);
      if (key) await this.storage.delete(key);
    }

    return { avatarUrl: null };
  }

  private async assertCanCreateEmployee(
    actorId: string,
    warehouseId: number | null,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.hierarchy.lock(tx);
      const actorAccess = await this.hierarchy.getActorAccess(tx, actorId);
      await this.assertWarehouseExists(tx, warehouseId);
      this.hierarchy.assertPermissionInContext(actorAccess, 'employee:create', {
        warehouseId,
      });
    });
  }

  private withPublicAvatar<T extends EmployeeWithAvatar>(employee: T): T {
    return {
      ...employee,
      avatarUrl: this.storage.normalizePublicUrl(employee.avatarUrl),
    };
  }

  private async assertCanManageTargetWithPermission(
    actorId: string,
    targetId: string,
    permission: Permission,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.hierarchy.lock(tx);
      const actorAccess = await this.hierarchy.getActorAccess(tx, actorId);
      const target = await this.hierarchy.getEmployeeAuthorizationTarget(tx, targetId);
      this.hierarchy.assertPermissionInContext(actorAccess, permission, {
        warehouseId: target.warehouseId,
      });
      this.hierarchy.assertCanManageEmployee(actorAccess, target);
    });
  }

  private async assertWarehouseExists(
    tx: Prisma.TransactionClient,
    warehouseId: number | null,
  ): Promise<void> {
    if (warehouseId === null) return;
    const warehouse = await tx.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true },
    });
    if (!warehouse) throw new BadRequestException(`Warehouse ${warehouseId} does not exist`);
  }
}
