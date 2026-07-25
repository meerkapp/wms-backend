import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService, AuthSessionResult } from '../auth/auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InitDto } from './dto/init.dto';

const SETUP_ADVISORY_LOCK_ID = 918273645;

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

  async init(dto: InitDto): Promise<AuthSessionResult> {
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const employee = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`
          SELECT pg_advisory_xact_lock(${SETUP_ADVISORY_LOCK_ID}::bigint)::text AS lock_result
        `,
      );

      const settings = await tx.serverSettings.findUnique({
        where: { id: 1 },
      });
      if (settings?.setupCompleted) {
        throw new ForbiddenException('Setup has already been completed');
      }

      const adminRole = await tx.employeeRole.findUniqueOrThrow({
        where: { name: 'superadmin' },
      });

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

      await tx.priceList.create({
        data: {
          name: 'Default',
          currency: 'EUR',
          isDefault: true,
        },
      });

      await tx.productType.create({
        data: {
          name: 'Default',
          defaultWriteoffStrategy: 'FIFO',
          skuMode: 'SEQUENTIAL',
        },
      });

      await tx.serverSettings.upsert({
        where: { id: 1 },
        update: { setupCompleted: true },
        create: { id: 1, setupCompleted: true },
      });

      return newEmployee;
    });

    const permissions = await this.prisma.employeePermission.findMany({
      select: { name: true },
    });

    return this.authService.createAuthenticatedSession(
      employee,
      permissions.map((p) => p.name),
    );
  }
}
