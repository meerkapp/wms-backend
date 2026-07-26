import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ALL_PERMISSIONS } from '@meerkapp/wms-contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SUPERADMIN_ROLE_POSITION } from '../role/role-hierarchy.constants';
import { isRoleAssignmentScopeAllowed } from '../role/permission-scope';

@Injectable()
export class PermissionsSyncService implements OnModuleInit {
  private readonly logger = new Logger(PermissionsSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.sync();
  }

  async sync(): Promise<void> {
    const superadminRole = await this.prisma.employeeRole.upsert({
      where: { name: 'superadmin' },
      update: { position: SUPERADMIN_ROLE_POSITION },
      create: {
        name: 'superadmin',
        color: '#f43f5e',
        position: SUPERADMIN_ROLE_POSITION,
      },
    });

    const existing = await this.prisma.employeePermission.findMany();
    const existingNames = new Set(existing.map((p) => p.name));
    const expectedNames = new Set<string>(ALL_PERMISSIONS);

    const toAdd = ALL_PERMISSIONS.filter((name) => !existingNames.has(name));
    const toRemove = existing.filter((p) => !expectedNames.has(p.name));

    if (toAdd.length > 0 || toRemove.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const name of toAdd) {
          const permission = await tx.employeePermission.create({ data: { name } });
          await tx.employeeRolePermission.create({
            data: {
              employeeRoleId: superadminRole.id,
              employeePermissionId: permission.id,
            },
          });
        }

        if (toRemove.length > 0) {
          await tx.employeePermission.deleteMany({
            where: { id: { in: toRemove.map((p) => p.id) } },
          });
        }

        await this.assertScopedAssignmentsAreValid(tx);
      });
    } else {
      await this.assertScopedAssignmentsAreValid(this.prisma);
    }

    if (toAdd.length > 0) {
      this.logger.log(`Added permissions: ${toAdd.join(', ')}`);
    }
    if (toRemove.length > 0) {
      this.logger.log(`Removed permissions: ${toRemove.map((p) => p.name).join(', ')}`);
    }
  }

  private async assertScopedAssignmentsAreValid(
    client: Prisma.TransactionClient | PrismaService,
  ): Promise<void> {
    const assignments = await client.employeeRoleAssignment.findMany({
      where: { scopeType: 'WAREHOUSE' },
      select: {
        id: true,
        employeeRole: {
          select: {
            name: true,
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
    });

    const invalidAssignmentIds = assignments.flatMap(({ id, employeeRole }) => {
      const permissionNames = employeeRole.permissions.map(
        ({ employeePermission }) => employeePermission.name,
      );
      return !isRoleAssignmentScopeAllowed(
        'WAREHOUSE',
        employeeRole.name,
        permissionNames,
      )
        ? [id]
        : [];
    });

    if (invalidAssignmentIds.length > 0) {
      throw new Error(
        `Invalid warehouse role assignments: ${invalidAssignmentIds.join(', ')}`,
      );
    }
  }
}
