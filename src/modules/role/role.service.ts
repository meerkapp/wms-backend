import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const PROTECTED_ROLES = ['superadmin'];

const ROLE_SELECT = {
  id: true,
  name: true,
  color: true,
  updatedAt: true,
  permissions: {
    select: {
      employeePermission: {
        select: { id: true, name: true },
      },
    },
  },
} as const;

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.employeeRole.findMany({
      select: ROLE_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const role = await this.prisma.employeeRole.findUnique({
      where: { id },
      select: ROLE_SELECT,
    });
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    return role;
  }

  async create(dto: CreateRoleDto) {
    const { permissionIds, ...roleData } = dto;

    return this.prisma.employeeRole.create({
      data: {
        ...roleData,
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
  }

  async update(id: number, dto: UpdateRoleDto) {
    const role = await this.prisma.employeeRole.findUnique({ where: { id } });
    if (!role) throw new NotFoundException(`Role ${id} not found`);

    if (PROTECTED_ROLES.includes(role.name)) {
      throw new BadRequestException(`Role "${role.name}" is protected and cannot be modified`);
    }

    const { permissionIds, ...roleData } = dto;

    if (Object.keys(roleData).length > 0) {
      await this.prisma.employeeRole.update({
        where: { id },
        data: roleData,
      });
    }

    if (permissionIds !== undefined) {
      await this.prisma.employeeRolePermission.deleteMany({
        where: { employeeRoleId: id },
      });

      if (permissionIds.length > 0) {
        await this.prisma.employeeRolePermission.createMany({
          data: permissionIds.map((permId) => ({
            employeeRoleId: id,
            employeePermissionId: permId,
          })),
        });
      }
    }

    return this.findOne(id);
  }

  async findAllPermissions() {
    return this.prisma.employeePermission.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
