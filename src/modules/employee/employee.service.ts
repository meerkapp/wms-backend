import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
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

@Injectable()
export class EmployeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async create(dto: CreateEmployeeDto) {
    const existing = await this.prisma.employee.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const { password, roleIds, ...employeeData } = dto;
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

  async update(id: string, dto: UpdateEmployeeDto, permissions: string[]) {
    const { roleIds, newPassword, email, firstName, lastName, phone, warehouseId, isActive } = dto;

    if ((firstName !== undefined || lastName !== undefined || phone !== undefined) &&
        !permissions.includes('employee:update:info')) {
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

    if ((firstName !== undefined || lastName !== undefined || phone !== undefined) &&
        !permissions.includes('employee:update:own:info')) {
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

  async uploadAvatar(id: string, file: Express.Multer.File): Promise<{ avatarUrl: string }> {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);

    if (employee.avatarUrl) {
      const oldKey = employee.avatarUrl.split(`/${this.storage.bucket}/`)[1];
      if (oldKey) await this.storage.delete(oldKey);
    }

    const ext = file.originalname.split('.').pop();
    const key = `avatars/${id}.${ext}`;
    const avatarUrl = await this.storage.upload(key, file.buffer, file.mimetype);

    await this.prisma.employee.update({
      where: { id },
      data: { avatarUrl },
    });

    return { avatarUrl };
  }

  async deleteAvatar(id: string): Promise<{ avatarUrl: null }> {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);

    if (employee.avatarUrl) {
      const key = employee.avatarUrl.split(`/${this.storage.bucket}/`)[1];
      if (key) await this.storage.delete(key);
    }

    await this.prisma.employee.update({
      where: { id },
      data: { avatarUrl: null },
    });

    return { avatarUrl: null };
  }
}
