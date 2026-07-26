import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PermissionsSyncService } from '../src/modules/auth/permissions-sync.service';
import { cleanDatabase, createApp, seedAdmin } from './helpers';

describe('Role authorization (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  const rolePrefix = `e2e-role-${Date.now()}`;
  let sequence = 0;

  const roleName = (suffix: string) => `${rolePrefix}-${suffix}-${++sequence}`;

  async function createEmployeeToken(permissionNames: string[], position = 1_000_000 + sequence) {
    const password = 'Test1234!';
    const email = `role-actor-${++sequence}@e2e.test`;
    const permissions = await prisma.employeePermission.findMany({
      where: { name: { in: permissionNames } },
    });
    const role = await prisma.employeeRole.create({
      data: {
        name: roleName('actor'),
        color: '#64748b',
        position,
        permissions: {
          create: permissions.map(({ id }) => ({ employeePermissionId: id })),
        },
      },
    });
    await prisma.employee.create({
      data: {
        email,
        password: await bcrypt.hash(password, 10),
        firstName: 'Role',
        lastName: 'Actor',
        roleAssignments: { create: { employeeRoleId: role.id, scopeType: 'GLOBAL' } },
      },
    });

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return { token: response.body.access_token as string, roleId: role.id };
  }

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);
    ({ access_token: adminToken } = await seedAdmin(app));
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.employeeRole.deleteMany({
      where: { name: { startsWith: rolePrefix } },
    });
    await app.close();
  });

  it('maps duplicate names to conflict and reserves the protected role name', async () => {
    const name = roleName('duplicate');
    await request(app.getHttpServer())
      .post('/api/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name, color: '#000000' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name, color: '#ffffff' })
      .expect(409);

    await request(app.getHttpServer())
      .post('/api/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'superadmin', color: '#ffffff' })
      .expect(400);
  });

  it('rolls back metadata when one permission id is invalid', async () => {
    const permission = await prisma.employeePermission.findUniqueOrThrow({
      where: { name: 'role:update' },
    });
    const originalName = roleName('atomic');
    const role = await prisma.employeeRole.create({
      data: {
        name: originalName,
        color: '#111111',
        permissions: {
          create: { employeePermissionId: permission.id },
        },
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/role/${role.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: roleName('must-not-persist'),
        permissionIds: [permission.id, 2147483647],
      })
      .expect(400);

    const persisted = await prisma.employeeRole.findUniqueOrThrow({
      where: { id: role.id },
      include: { permissions: true },
    });
    expect(persisted.name).toBe(originalName);
    expect(persisted.permissions.map(({ employeePermissionId }) => employeePermissionId)).toEqual([
      permission.id,
    ]);
  });

  it('reports allowed scopes and protects existing warehouse assignments', async () => {
    const [employeeUpdateInfo, roleUpdate] = await Promise.all([
      prisma.employeePermission.findUniqueOrThrow({
        where: { name: 'employee:update:info' },
      }),
      prisma.employeePermission.findUniqueOrThrow({
        where: { name: 'role:update' },
      }),
    ]);
    const scopedRole = await prisma.employeeRole.create({
      data: {
        name: roleName('scoped'),
        color: '#334155',
        position: 10,
        permissions: {
          create: { employeePermissionId: employeeUpdateInfo.id },
        },
      },
    });
    const globalRole = await prisma.employeeRole.create({
      data: {
        name: roleName('global'),
        color: '#475569',
        position: 11,
        permissions: {
          create: { employeePermissionId: roleUpdate.id },
        },
      },
    });

    const roles = await request(app.getHttpServer())
      .get('/api/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(roles.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: scopedRole.id,
          allowedScopeTypes: ['GLOBAL', 'WAREHOUSE'],
        }),
        expect.objectContaining({
          id: globalRole.id,
          allowedScopeTypes: ['GLOBAL'],
        }),
      ]),
    );

    const country = await prisma.country.findFirstOrThrow();
    const organization = await prisma.organization.create({
      data: { name: roleName('organization') },
    });
    const locality = await prisma.locality.create({
      data: { name: roleName('locality'), countryId: country.id },
    });
    const warehouse = await prisma.warehouse.create({
      data: {
        code: roleName('warehouse'),
        address: 'Role scope warehouse',
        organizationId: organization.id,
        localityId: locality.id,
      },
    });
    await prisma.employee.create({
      data: {
        email: `${roleName('binding')}@e2e.test`,
        password: await bcrypt.hash('Test1234!', 10),
        firstName: 'Scoped',
        lastName: 'Binding',
        roleAssignments: {
          create: {
            employeeRoleId: scopedRole.id,
            scopeType: 'WAREHOUSE',
            warehouseId: warehouse.id,
          },
        },
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/role/${scopedRole.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissionIds: [employeeUpdateInfo.id, roleUpdate.id] })
      .expect(400);

    expect(
      await prisma.employeeRolePermission.findMany({
        where: { employeeRoleId: scopedRole.id },
        select: { employeePermissionId: true },
      }),
    ).toEqual([{ employeePermissionId: employeeUpdateInfo.id }]);
  });

  it('enforces role assignment scope invariants in the database', async () => {
    const country = await prisma.country.findFirstOrThrow();
    const organization = await prisma.organization.create({
      data: { name: roleName('constraint-organization') },
    });
    const locality = await prisma.locality.create({
      data: { name: roleName('constraint-locality'), countryId: country.id },
    });
    const warehouse = await prisma.warehouse.create({
      data: {
        code: roleName('constraint-warehouse'),
        address: 'Constraint warehouse',
        organizationId: organization.id,
        localityId: locality.id,
      },
    });
    const role = await prisma.employeeRole.create({
      data: {
        name: roleName('constraint-role'),
        color: '#64748b',
        permissions: {
          create: {
            employeePermission: {
              connect: { name: 'employee:update:info' },
            },
          },
        },
      },
    });
    const employee = await prisma.employee.create({
      data: {
        email: `${roleName('constraint-employee')}@e2e.test`,
        password: await bcrypt.hash('Test1234!', 10),
        firstName: 'Constraint',
        lastName: 'Employee',
      },
    });

    await prisma.employeeRoleAssignment.create({
      data: {
        employeeId: employee.id,
        employeeRoleId: role.id,
        scopeType: 'WAREHOUSE',
        warehouseId: warehouse.id,
      },
    });

    await expect(
      prisma.employeeRoleAssignment.create({
        data: {
          employeeId: employee.id,
          employeeRoleId: role.id,
          scopeType: 'WAREHOUSE',
          warehouseId: warehouse.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await expect(
      prisma.employeeRoleAssignment.create({
        data: {
          employeeId: employee.id,
          employeeRoleId: role.id,
          scopeType: 'GLOBAL',
          warehouseId: warehouse.id,
        },
      }),
    ).rejects.toThrow('employee_role_assignment_scope_check');
  });

  it('fails permission sync when a warehouse binding violates the role scope policy', async () => {
    const country = await prisma.country.findFirstOrThrow();
    const organization = await prisma.organization.create({
      data: { name: roleName('integrity-organization') },
    });
    const locality = await prisma.locality.create({
      data: { name: roleName('integrity-locality'), countryId: country.id },
    });
    const warehouse = await prisma.warehouse.create({
      data: {
        code: roleName('integrity-warehouse'),
        address: 'Integrity warehouse',
        organizationId: organization.id,
        localityId: locality.id,
      },
    });
    const role = await prisma.employeeRole.create({
      data: {
        name: roleName('invalid-scoped-role'),
        color: '#64748b',
        permissions: {
          create: {
            employeePermission: {
              connect: { name: 'role:update' },
            },
          },
        },
      },
    });
    const employee = await prisma.employee.create({
      data: {
        email: `${roleName('invalid-scoped-employee')}@e2e.test`,
        password: await bcrypt.hash('Test1234!', 10),
        firstName: 'Invalid',
        lastName: 'Binding',
      },
    });
    await prisma.employeeRoleAssignment.create({
      data: {
        employeeId: employee.id,
        employeeRoleId: role.id,
        scopeType: 'WAREHOUSE',
        warehouseId: warehouse.id,
      },
    });

    try {
      await expect(app.get(PermissionsSyncService).sync()).rejects.toThrow(
        'Invalid warehouse role assignments',
      );
    } finally {
      await prisma.employeeRoleAssignment.deleteMany({ where: { employeeId: employee.id } });
      await prisma.employee.delete({ where: { id: employee.id } });
      await prisma.employeeRole.delete({ where: { id: role.id } });
    }
  });

  it('prevents a role manager from delegating a permission they do not have', async () => {
    const { token } = await createEmployeeToken(['role:update']);
    const [roleUpdate, employeeCreate] = await Promise.all([
      prisma.employeePermission.findUniqueOrThrow({ where: { name: 'role:update' } }),
      prisma.employeePermission.findUniqueOrThrow({ where: { name: 'employee:create' } }),
    ]);
    const target = await prisma.employeeRole.create({
      data: { name: roleName('target'), color: '#222222' },
    });

    await request(app.getHttpServer())
      .patch(`/api/role/${target.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissionIds: [roleUpdate.id, employeeCreate.id] })
      .expect(403);

    expect(
      await prisma.employeeRolePermission.count({ where: { employeeRoleId: target.id } }),
    ).toBe(0);
  });

  it('lets a role manager preserve or remove an existing permission without re-granting it', async () => {
    const { token } = await createEmployeeToken(['role:update']);
    const [roleUpdate, employeeCreate] = await Promise.all([
      prisma.employeePermission.findUniqueOrThrow({ where: { name: 'role:update' } }),
      prisma.employeePermission.findUniqueOrThrow({ where: { name: 'employee:create' } }),
    ]);
    const target = await prisma.employeeRole.create({
      data: {
        name: roleName('existing-permission'),
        color: '#222222',
        permissions: {
          create: { employeePermissionId: employeeCreate.id },
        },
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/role/${target.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissionIds: [employeeCreate.id, roleUpdate.id] })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/role/${target.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissionIds: [roleUpdate.id] })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/role/${target.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissionIds: [employeeCreate.id, roleUpdate.id] })
      .expect(403);

    const persisted = await prisma.employeeRolePermission.findMany({
      where: { employeeRoleId: target.id },
    });
    expect(persisted.map(({ employeePermissionId }) => employeePermissionId)).toEqual([
      roleUpdate.id,
    ]);
  });

  it('only allows managing roles below the acting employee highest role', async () => {
    const actorPosition = 100;
    const { token } = await createEmployeeToken(
      ['role:update', 'employee:update:roles'],
      actorPosition,
    );
    const lowerRole = await prisma.employeeRole.create({
      data: {
        name: roleName('lower'),
        color: '#111111',
        position: actorPosition - 1,
      },
    });
    const equalRole = await prisma.employeeRole.create({
      data: {
        name: roleName('equal'),
        color: '#222222',
        position: actorPosition,
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/role/${lowerRole.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ color: '#00ff00' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/role/${equalRole.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ color: '#ff0000' })
      .expect(403);

    const roles = await request(app.getHttpServer())
      .get('/api/role')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(roles.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: lowerRole.id,
          canManage: true,
          canAssign: true,
        }),
        expect.objectContaining({
          id: equalRole.id,
          canManage: false,
          canAssign: false,
        }),
        expect.objectContaining({
          name: 'superadmin',
          canManage: false,
          canAssign: false,
        }),
      ]),
    );
  });

  it('only reorders the complete hierarchy below the acting employee', async () => {
    const { token, roleId } = await createEmployeeToken(['role:update'], 500);
    await prisma.employeeRole.createMany({
      data: [
        { name: roleName('reorder-a'), color: '#111111', position: 20 },
        { name: roleName('reorder-b'), color: '#222222', position: 10 },
      ],
    });
    const before = await request(app.getHttpServer())
      .get('/api/role')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const manageableIds = (before.body as Array<{ id: number; canManage: boolean }>)
      .filter(({ canManage }) => canManage)
      .map(({ id }) => id);
    const reversedIds = [...manageableIds].reverse();

    const reordered = await request(app.getHttpServer())
      .put('/api/role/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ roleIds: reversedIds })
      .expect(200);
    expect(
      (reordered.body as Array<{ id: number; canManage: boolean }>)
        .filter(({ canManage }) => canManage)
        .map(({ id }) => id),
    ).toEqual(reversedIds);

    await request(app.getHttpServer())
      .put('/api/role/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ roleIds: [...reversedIds, roleId] })
      .expect(400);
  });

  it('serializes concurrent full hierarchy reorders', async () => {
    const roles = await request(app.getHttpServer())
      .get('/api/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const customRoleIds = (roles.body as Array<{ id: number; canManage: boolean }>)
      .filter(({ canManage }) => canManage)
      .map(({ id }) => id);
    const firstOrder = [...customRoleIds];
    const secondOrder = [...customRoleIds].reverse();

    const results = await Promise.all([
      request(app.getHttpServer())
        .put('/api/role/order')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleIds: firstOrder }),
      request(app.getHttpServer())
        .put('/api/role/order')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleIds: secondOrder }),
    ]);
    expect(results.map(({ status }) => status)).toEqual([200, 200]);

    const persisted = await request(app.getHttpServer())
      .get('/api/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const persistedOrder = (persisted.body as Array<{ id: number; canManage: boolean }>)
      .filter(({ canManage }) => canManage)
      .map(({ id }) => id);
    expect([firstOrder, secondOrder]).toContainEqual(persistedOrder);
  });

  it('revalidates the acting employee permissions inside the mutation', async () => {
    const { token, roleId } = await createEmployeeToken(['role:update']);
    const target = await prisma.employeeRole.create({
      data: { name: roleName('stale-token-target'), color: '#333333' },
    });
    await prisma.employeeRolePermission.deleteMany({
      where: { employeeRoleId: roleId },
    });

    await request(app.getHttpServer())
      .patch(`/api/role/${target.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ color: '#ffffff' })
      .expect(403);

    expect(await prisma.employeeRole.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject(
      { color: '#333333' },
    );
  });
});
