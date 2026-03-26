import { ForbiddenException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService, TokenPair } from '../auth/auth.service';
import { ALL_PERMISSIONS } from '../auth/permissions';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InitDto } from './dto/init.dto';

const COUNTRY_CODES = [
  'AC', 'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS',
  'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH',
  'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW',
  'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM',
  'CN', 'CO', 'CP', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DG',
  'DJ', 'DK', 'DM', 'DO', 'DZ', 'EA', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES',
  'ET', 'EU', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE',
  'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT',
  'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'IC', 'ID', 'IE',
  'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA',
  'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC',
  'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ',
  'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE',
  'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE',
  'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
  'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG',
  'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV',
  'SX', 'SY', 'SZ', 'TA', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL',
  'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'UN',
  'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS',
  'XK', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
];

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

      await tx.country.createMany({
        data: COUNTRY_CODES.map((code) => ({ code })),
        skipDuplicates: true,
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
