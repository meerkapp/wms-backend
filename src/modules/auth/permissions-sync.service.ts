import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ALL_PERMISSIONS } from './permissions';

@Injectable()
export class PermissionsSyncService implements OnModuleInit {
  private readonly logger = new Logger(PermissionsSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.sync();
  }

  private async sync(): Promise<void> {
    const superadminRole = await this.prisma.employeeRole.findUnique({
      where: { name: 'superadmin' },
    });

    // skip if setup has not been completed yet
    if (!superadminRole) return;

    const existing = await this.prisma.employeePermission.findMany();
    const existingNames = new Set(existing.map((p) => p.name));
    const expectedNames = new Set<string>(ALL_PERMISSIONS);

    const toAdd = ALL_PERMISSIONS.filter((name) => !existingNames.has(name));
    const toRemove = existing.filter((p) => !expectedNames.has(p.name));

    if (toAdd.length === 0 && toRemove.length === 0) return;

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
    });

    if (toAdd.length > 0) {
      this.logger.log(`Added permissions: ${toAdd.join(', ')}`);
    }
    if (toRemove.length > 0) {
      this.logger.log(`Removed permissions: ${toRemove.map((p) => p.name).join(', ')}`);
    }
  }
}
