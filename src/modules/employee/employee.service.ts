import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateOwnEmailDto, UpdateOwnPasswordDto, UpdateEmployeeEmailDto, UpdateEmployeePasswordDto } from './dto/update-own-profile.dto';

const EMPLOYEE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
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
          permissions: {
            select: {
              employeePermission: {
                select: { id: true, name: true },
              },
            },
          },
        },
      },
    },
  },
} as const;

@Injectable()
export class EmployeeService {
  constructor(private readonly prisma: PrismaService) {}

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

  async update(id: string, dto: UpdateEmployeeDto) {
    return this.prisma.employee
      .update({
        where: { id },
        data: dto,
        select: EMPLOYEE_SELECT,
      })
      .catch(() => {
        throw new NotFoundException(`Employee ${id} not found`);
      });
  }

  async deactivate(id: string) {
    return this.prisma.employee
      .update({
        where: { id },
        data: { isActive: false },
        select: EMPLOYEE_SELECT,
      })
      .catch(() => {
        throw new NotFoundException(`Employee ${id} not found`);
      });
  }

  async assignRole(employeeId: string, roleId: number) {
    const role = await this.prisma.employeeRole.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException(`Role ${roleId} not found`);

    await this.prisma.employeeRoleAssignment.upsert({
      where: {
        employeeId_employeeRoleId: {
          employeeId,
          employeeRoleId: roleId,
        },
      },
      update: {},
      create: { employeeId, employeeRoleId: roleId },
    });

    return this.findOne(employeeId);
  }

  async removeRole(employeeId: string, roleId: number) {
    await this.prisma.employeeRoleAssignment
      .delete({
        where: {
          employeeId_employeeRoleId: {
            employeeId,
            employeeRoleId: roleId,
          },
        },
      })
      .catch(() => {
        throw new NotFoundException(`Role assignment not found`);
      });

    return this.findOne(employeeId);
  }

  async updateEmail(id: string, dto: UpdateEmployeeEmailDto) {
    const existing = await this.prisma.employee.findUnique({
      where: { email: dto.email },
    });
    if (existing && existing.id !== id) {
      throw new ConflictException('Email already in use');
    }

    return this.prisma.employee
      .update({
        where: { id },
        data: { email: dto.email },
        select: EMPLOYEE_SELECT,
      })
      .catch(() => {
        throw new NotFoundException(`Employee ${id} not found`);
      });
  }

  async updatePassword(id: string, dto: UpdateEmployeePasswordDto) {
    const hashed = await bcrypt.hash(dto.newPassword, 10);

    return this.prisma.employee
      .update({
        where: { id },
        data: { password: hashed },
        select: EMPLOYEE_SELECT,
      })
      .catch(() => {
        throw new NotFoundException(`Employee ${id} not found`);
      });
  }

  async updateOwnEmail(id: string, dto: UpdateOwnEmailDto) {
    const existing = await this.prisma.employee.findUnique({ where: { email: dto.email } });
    if (existing && existing.id !== id) {
      throw new ConflictException('Email already in use');
    }

    return this.prisma.employee.update({
      where: { id },
      data: { email: dto.email },
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
}
