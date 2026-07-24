import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { RoleHierarchyService } from '../role/role-hierarchy.service';
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
      employeeRole: {
        select: {
          id: true,
          name: true,
          color: true,
          position: true,
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

@Injectable()
export class EmployeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly hierarchy: RoleHierarchyService,
  ) {}

  async create(dto: CreateEmployeeDto, actorId: string) {
    const { password, roleIds, ...employeeData } = dto;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const employee = await this.prisma.$transaction(async (tx) => {
        await this.hierarchy.lock(tx);
        const actorAccess = await this.hierarchy.getActorAccess(tx, actorId);
        this.hierarchy.assertCurrentPermission(actorAccess, 'employee:create');
        await this.hierarchy.assertAssignableRoles(tx, roleIds ?? [], actorAccess);

        const employee = await tx.employee.create({
          data: { ...employeeData, password: hashedPassword },
        });

        if (roleIds?.length) {
          await tx.employeeRoleAssignment.createMany({
            data: roleIds.map((roleId) => ({
              employeeId: employee.id,
              employeeRoleId: roleId,
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

  async update(id: string, dto: UpdateEmployeeDto, permissions: string[], actorId: string) {
    const { roleIds, newPassword, email, firstName, lastName, phone, warehouseId, isActive } = dto;

    const permissionRequirements = [
      {
        applies: firstName !== undefined || lastName !== undefined || phone !== undefined,
        permission: 'employee:update:info',
        error: 'No permission to update info',
      },
      {
        applies: warehouseId !== undefined,
        permission: 'employee:update:warehouse',
        error: 'No permission to update warehouse',
      },
      {
        applies: roleIds !== undefined,
        permission: 'employee:update:roles',
        error: 'No permission to update roles',
      },
      {
        applies: email !== undefined,
        permission: 'employee:update:email',
        error: 'No permission to update email',
      },
      {
        applies: newPassword !== undefined,
        permission: 'employee:update:password',
        error: 'No permission to update password',
      },
      {
        applies: isActive !== undefined,
        permission: 'employee:toggle:active',
        error: 'No permission to toggle employee active status',
      },
    ] as const;

    for (const requirement of permissionRequirements) {
      if (requirement.applies && !permissions.includes(requirement.permission)) {
        throw new ForbiddenException(requirement.error);
      }
    }

    const hashedNewPassword =
      newPassword === undefined ? undefined : await bcrypt.hash(newPassword, 10);

    try {
      const employee = await this.prisma.$transaction(async (tx) => {
        await this.hierarchy.lock(tx);
        const actorAccess = await this.hierarchy.getActorAccess(tx, actorId);
        await this.hierarchy.assertCanManageEmployee(tx, id, actorAccess);
        for (const requirement of permissionRequirements) {
          if (requirement.applies) {
            this.hierarchy.assertCurrentPermission(actorAccess, requirement.permission);
          }
        }
        if (roleIds !== undefined) {
          await this.hierarchy.assertAssignableRoles(tx, roleIds, actorAccess);
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

        if (roleIds !== undefined) {
          await tx.employeeRoleAssignment.deleteMany({ where: { employeeId: id } });
          if (roleIds.length > 0) {
            await tx.employeeRoleAssignment.createMany({
              data: roleIds.map((roleId) => ({ employeeId: id, employeeRoleId: roleId })),
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
      await this.assertCanManageTarget(actorId, id);
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
          this.hierarchy.assertCurrentPermission(actorAccess, 'employee:update:avatar');
          await this.hierarchy.assertCanManageEmployee(tx, id, actorAccess);
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
        this.hierarchy.assertCurrentPermission(actorAccess, 'employee:update:avatar');
        await this.hierarchy.assertCanManageEmployee(tx, id, actorAccess);
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

  private withPublicAvatar<T extends EmployeeWithAvatar>(employee: T): T {
    return {
      ...employee,
      avatarUrl: this.storage.normalizePublicUrl(employee.avatarUrl),
    };
  }

  private async assertCanManageTarget(actorId: string, targetId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.hierarchy.lock(tx);
      const actorAccess = await this.hierarchy.getActorAccess(tx, actorId);
      this.hierarchy.assertCurrentPermission(actorAccess, 'employee:update:avatar');
      await this.hierarchy.assertCanManageEmployee(tx, targetId, actorAccess);
    });
  }
}
