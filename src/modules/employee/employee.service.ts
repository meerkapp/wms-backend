import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
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

const PROTECTED_ROLE_NAME = 'superadmin';

@Injectable()
export class EmployeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async create(dto: CreateEmployeeDto, actorId: string) {
    const existing = await this.prisma.employee.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const { password, roleIds, ...employeeData } = dto;
    await this.assertProtectedRoleBoundary(actorId, { roleIds });
    const hashedPassword = await bcrypt.hash(password, 10);

    return this.prisma.$transaction(async (tx) => {
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
      items,
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
    return employee;
  }

  async update(id: string, dto: UpdateEmployeeDto, permissions: string[], actorId: string) {
    const { roleIds, newPassword, email, firstName, lastName, phone, warehouseId, isActive } = dto;

    await this.assertProtectedRoleBoundary(actorId, { targetId: id, roleIds });

    if (
      (firstName !== undefined || lastName !== undefined || phone !== undefined) &&
      !permissions.includes('employee:update:info')
    ) {
      throw new ForbiddenException('No permission to update info');
    }
    if (warehouseId !== undefined && !permissions.includes('employee:update:warehouse')) {
      throw new ForbiddenException('No permission to update warehouse');
    }
    if (roleIds !== undefined && !permissions.includes('employee:update:roles')) {
      throw new ForbiddenException('No permission to update roles');
    }
    if (email !== undefined && !permissions.includes('employee:update:email')) {
      throw new ForbiddenException('No permission to update email');
    }
    if (newPassword !== undefined && !permissions.includes('employee:update:password')) {
      throw new ForbiddenException('No permission to update password');
    }
    if (isActive !== undefined && !permissions.includes('employee:toggle:active')) {
      throw new ForbiddenException('No permission to toggle employee active status');
    }

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { id } });
      if (!employee) throw new NotFoundException(`Employee ${id} not found`);

      const dataToUpdate: Record<string, unknown> = {};
      if (firstName !== undefined) dataToUpdate.firstName = firstName;
      if (lastName !== undefined) dataToUpdate.lastName = lastName;
      if (phone !== undefined) dataToUpdate.phone = phone;
      if (warehouseId !== undefined) dataToUpdate.warehouseId = warehouseId;
      if (isActive !== undefined) dataToUpdate.isActive = isActive;

      if (email !== undefined) {
        const existing = await tx.employee.findUnique({ where: { email } });
        if (existing && existing.id !== id) throw new ConflictException('Email already in use');
        dataToUpdate.email = email;
      }

      if (newPassword !== undefined) {
        dataToUpdate.password = await bcrypt.hash(newPassword, 10);
      }

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

    return this.prisma.employee.update({
      where: { id },
      data: dataToUpdate,
      select: EMPLOYEE_SELECT,
    });
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
    if (actorId) await this.assertProtectedRoleBoundary(actorId, { targetId: id });

    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);

    const extension = AVATAR_FILE_EXTENSIONS[file.mimetype];
    if (!extension || !hasValidAvatarSignature(file)) {
      throw new BadRequestException('Unsupported avatar image type');
    }

    const key = `avatars/${id}/${randomUUID()}.${extension}`;
    const avatarUrl = await this.storage.upload(key, file.buffer, file.mimetype);

    try {
      await this.prisma.employee.update({
        where: { id },
        data: { avatarUrl },
      });
    } catch (error) {
      await this.storage.delete(key);
      throw error;
    }

    if (employee.avatarUrl) {
      const oldKey = employee.avatarUrl.split(`/${this.storage.bucket}/`)[1];
      if (oldKey) await this.storage.delete(oldKey);
    }

    return { avatarUrl };
  }

  async deleteAvatar(id: string, actorId?: string): Promise<{ avatarUrl: null }> {
    if (actorId) await this.assertProtectedRoleBoundary(actorId, { targetId: id });

    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);

    await this.prisma.employee.update({
      where: { id },
      data: { avatarUrl: null },
    });

    if (employee.avatarUrl) {
      const key = employee.avatarUrl.split(`/${this.storage.bucket}/`)[1];
      if (key) await this.storage.delete(key);
    }

    return { avatarUrl: null };
  }

  private async assertProtectedRoleBoundary(
    actorId: string,
    { targetId, roleIds }: { targetId?: string; roleIds?: number[] },
  ): Promise<void> {
    const actorHasProtectedRole = await this.prisma.employeeRoleAssignment.findFirst({
      where: {
        employeeId: actorId,
        employeeRole: { name: PROTECTED_ROLE_NAME },
      },
      select: { id: true },
    });
    if (actorHasProtectedRole) return;

    const [targetHasProtectedRole, assignsProtectedRole] = await Promise.all([
      targetId
        ? this.prisma.employeeRoleAssignment.findFirst({
            where: {
              employeeId: targetId,
              employeeRole: { name: PROTECTED_ROLE_NAME },
            },
            select: { id: true },
          })
        : null,
      roleIds?.length
        ? this.prisma.employeeRole.findFirst({
            where: { id: { in: roleIds }, name: PROTECTED_ROLE_NAME },
            select: { id: true },
          })
        : null,
    ]);

    if (targetHasProtectedRole || assignsProtectedRole) {
      throw new ForbiddenException('Only a superadmin can manage protected accounts and roles');
    }
  }
}
