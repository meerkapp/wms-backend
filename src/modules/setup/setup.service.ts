import { ForbiddenException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService, TokenPair } from '../auth/auth.service';
import { ALL_PERMISSIONS } from '../auth/permissions';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InitDto } from './dto/init.dto';

@Injectable()
export class SetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async getStatus(): Promise<{ setupRequired: boolean }> {
    const settings = await this.prisma.serverSettings.findUnique({
      where: { id: 1 },
    });
    return { setupRequired: !settings?.setupCompleted };
  }

  async init(dto: InitDto): Promise<TokenPair> {
    const settings = await this.prisma.serverSettings.findUnique({
      where: { id: 1 },
    });
    if (settings?.setupCompleted) {
      throw new ForbiddenException('Setup has already been completed');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const employee = await this.prisma.$transaction(async (tx) => {
      for (const name of ALL_PERMISSIONS) {
        await tx.employeePermission.upsert({
          where: { name },
          update: {},
          create: { name },
        });
      }

      const adminRole = await tx.employeeRole.upsert({
        where: { name: 'superadmin' },
        update: {},
        create: { name: 'superadmin' },
      });

      const permissions = await tx.employeePermission.findMany({
        where: { name: { in: [...ALL_PERMISSIONS] } },
      });

      for (const permission of permissions) {
        await tx.employeeRolePermission.upsert({
          where: {
            employeeRoleId_employeePermissionId: {
              employeeRoleId: adminRole.id,
              employeePermissionId: permission.id,
            },
          },
          update: {},
          create: {
            employeeRoleId: adminRole.id,
            employeePermissionId: permission.id,
          },
        });
      }

      const newEmployee = await tx.employee.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
      });

      await tx.employeeRoleAssignment.create({
        data: {
          employeeId: newEmployee.id,
          employeeRoleId: adminRole.id,
        },
      });

      await tx.serverSettings.upsert({
        where: { id: 1 },
        update: { setupCompleted: true },
        create: { id: 1, setupCompleted: true },
      });

      return newEmployee;
    });

    return this.authService.issueTokens(employee, [...ALL_PERMISSIONS]);
  }
}
