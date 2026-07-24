import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/common/prisma/prisma.service';
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
        roleAssignments: { create: { employeeRoleId: role.id } },
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
    const { token } = await createEmployeeToken(['role:update'], actorPosition);
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
