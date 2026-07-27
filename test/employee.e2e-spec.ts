import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StorageService } from '../src/common/storage/storage.service';
import { ADMIN, cleanDatabase, createApp, seedAdmin } from './helpers';

// 1×1 transparent PNG
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const avatarUrlForKey = (key: string) => `http://minio:9000/test-bucket/${key}`;
const publicAvatarUrl = (url: string | null) =>
  url?.replace('http://minio:9000', '/storage') ?? null;

const mockStorage = {
  upload: jest.fn((key: string) => Promise.resolve(avatarUrlForKey(key))),
  delete: jest.fn().mockResolvedValue(undefined),
  normalizePublicUrl: jest.fn(publicAvatarUrl),
  getObjectKey: jest.fn((url: string) => url.split('/test-bucket/')[1] ?? null),
  bucket: 'test-bucket',
};

describe('Employee (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let adminEmployeeId: string;
  let targetEmployeeId: string;
  let warehouseAId: number;
  let warehouseBId: number;

  let counter = 0;
  const uniqueEmail = (prefix = 'user') => `${prefix}-${++counter}@e2e.test`;

  // Creates an employee with the given permissions and returns their access token.
  async function tokenFor(
    permissions: string[],
    email = uniqueEmail('limited'),
    position = 1_000_000 - counter,
    options: {
      scopeType?: 'GLOBAL' | 'WAREHOUSE';
      scopeWarehouseId?: number;
      additionalWarehouseIds?: number[];
      employeeWarehouseId?: number;
    } = {},
  ): Promise<string> {
    const {
      scopeType = 'GLOBAL',
      scopeWarehouseId,
      additionalWarehouseIds = [],
      employeeWarehouseId,
    } = options;
    const password = 'Test1234!';
    const role = await prisma.employeeRole.create({
      data: {
        name: `role-${Date.now()}-${counter}`,
        color: '#aaaaaa',
        position,
      },
    });

    if (permissions.length > 0) {
      const perms = await prisma.employeePermission.findMany({
        where: { name: { in: permissions } },
      });
      await prisma.employeeRolePermission.createMany({
        data: perms.map((p) => ({ employeeRoleId: role.id, employeePermissionId: p.id })),
      });
    }

    await prisma.employee.create({
      data: {
        email,
        password: await bcrypt.hash(password, 10),
        firstName: 'Limited',
        lastName: 'User',
        warehouseId: employeeWarehouseId,
        roleAssignments: {
          create: [
            {
              employeeRoleId: role.id,
              scopeType,
              warehouseId: scopeType === 'WAREHOUSE' ? scopeWarehouseId : null,
            },
            ...additionalWarehouseIds.map((warehouseId) => ({
              employeeRoleId: role.id,
              scopeType: 'WAREHOUSE' as const,
              warehouseId,
            })),
          ],
        },
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });
    return res.body.access_token as string;
  }

  // Creates an employee with no role (no permissions) and returns their token.
  async function tokenNoPerms(): Promise<string> {
    const email = uniqueEmail('noperms');
    const password = 'Test1234!';
    await prisma.employee.create({
      data: {
        email,
        password: await bcrypt.hash(password, 10),
        firstName: 'No',
        lastName: 'Perms',
      },
    });
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });
    return res.body.access_token as string;
  }

  async function employeeAt(
    prefix: string,
    warehouseId: number | null,
    roleAssignments: Array<{
      employeeRoleId: number;
      scopeType: 'GLOBAL' | 'WAREHOUSE';
      warehouseId: number | null;
    }> = [],
  ) {
    return prisma.employee.create({
      data: {
        email: uniqueEmail(prefix),
        password: await bcrypt.hash('Test1234!', 10),
        firstName: prefix,
        lastName: 'Employee',
        warehouseId,
        roleAssignments: roleAssignments.length > 0 ? { create: roleAssignments } : undefined,
      },
    });
  }

  beforeAll(async () => {
    app = await createApp([{ token: StorageService, value: mockStorage }]);
    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);
    ({ access_token: adminToken } = await seedAdmin(app));
    adminEmployeeId = (
      await prisma.employee.findUniqueOrThrow({
        where: { email: ADMIN.email },
        select: { id: true },
      })
    ).id;

    const country = await prisma.country.findFirstOrThrow();
    const organization = await prisma.organization.create({
      data: { name: 'Scoped access organization' },
    });
    const locality = await prisma.locality.create({
      data: { name: 'Scoped access locality', countryId: country.id },
    });
    const [warehouseA, warehouseB] = await Promise.all([
      prisma.warehouse.create({
        data: {
          code: 'SCOPE-A',
          address: 'Scope A',
          organizationId: organization.id,
          localityId: locality.id,
        },
      }),
      prisma.warehouse.create({
        data: {
          code: 'SCOPE-B',
          address: 'Scope B',
          organizationId: organization.id,
          localityId: locality.id,
        },
      }),
    ]);
    warehouseAId = warehouseA.id;
    warehouseBId = warehouseB.id;

    // Shared target employee used across multiple test groups
    const emp = await prisma.employee.create({
      data: {
        email: 'target@e2e.test',
        password: await bcrypt.hash('Test1234!', 10),
        firstName: 'Target',
        lastName: 'Employee',
        warehouseId: warehouseAId,
      },
    });
    targetEmployeeId = emp.id;
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.upload.mockImplementation((key: string) => Promise.resolve(avatarUrlForKey(key)));
  });

  // ---------------------------------------------------------------------------
  describe('GET /api/employee', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/employee').expect(401);
    });

    it('returns paginated list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/employee')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        items: expect.any(Array),
        total: expect.any(Number),
        page: 1,
        limit: 20,
        pages: expect.any(Number),
      });
    });

    it('respects page and limit query params', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/employee?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.limit).toBe(5);
      expect(res.body.page).toBe(1);
      expect(res.body.items.length).toBeLessThanOrEqual(5);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /api/employee', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/api/employee')
        .send({ email: 'x@test.com', password: 'Test1234!', firstName: 'A', lastName: 'B' })
        .expect(401);
    });

    it('returns 403 without employee:create permission', async () => {
      const token = await tokenNoPerms();
      await request(app.getHttpServer())
        .post('/api/employee')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: uniqueEmail(), password: 'Test1234!', firstName: 'A', lastName: 'B' })
        .expect(403);
    });

    it('returns 400 for invalid body', async () => {
      await request(app.getHttpServer())
        .post('/api/employee')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'not-an-email', password: 'short' })
        .expect(400);
    });

    it('rejects the removed roleIds field on creation', async () => {
      const email = uniqueEmail('removed-role-ids');

      await request(app.getHttpServer())
        .post('/api/employee')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          password: 'Test1234!',
          firstName: 'Removed',
          lastName: 'Field',
          roleIds: [],
        })
        .expect(400);

      expect(await prisma.employee.findUnique({ where: { email } })).toBeNull();
    });

    it('creates employee and returns profile without password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/employee')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'created@e2e.test',
          password: 'Test1234!',
          firstName: 'Created',
          lastName: 'Employee',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        email: 'created@e2e.test',
        firstName: 'Created',
        lastName: 'Employee',
      });
      expect(res.body).not.toHaveProperty('password');
    });

    it('returns 409 for duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/api/employee')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: ADMIN.email, password: 'Test1234!', firstName: 'Dup', lastName: 'User' })
        .expect(409);
    });

    it('does not let a non-superadmin assign the protected role', async () => {
      const token = await tokenFor(['employee:create', 'employee:update:roles']);
      const superadminRole = await prisma.employeeRole.findUniqueOrThrow({
        where: { name: 'superadmin' },
      });

      await request(app.getHttpServer())
        .post('/api/employee')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: uniqueEmail('protected-role'),
          password: 'Test1234!',
          firstName: 'Protected',
          lastName: 'Attempt',
          roleAssignments: [{ roleId: superadminRole.id, scopeType: 'GLOBAL' }],
        })
        .expect(403);
    });

    it('does not let an employee assign a role with permissions they do not have', async () => {
      const token = await tokenFor(['employee:create', 'employee:update:roles']);
      const roleUpdatePermission = await prisma.employeePermission.findUniqueOrThrow({
        where: { name: 'role:update' },
      });
      const strongerRole = await prisma.employeeRole.create({
        data: {
          name: `stronger-role-${Date.now()}-${counter}`,
          color: '#ff0000',
          permissions: {
            create: { employeePermissionId: roleUpdatePermission.id },
          },
        },
      });
      const email = uniqueEmail('role-escalation');

      await request(app.getHttpServer())
        .post('/api/employee')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email,
          password: 'Test1234!',
          firstName: 'Escalation',
          lastName: 'Attempt',
          roleAssignments: [{ roleId: strongerRole.id, scopeType: 'GLOBAL' }],
        })
        .expect(403);

      expect(await prisma.employee.findUnique({ where: { email } })).toBeNull();
    });

    it('does not let an employee assign a role at or above their highest role', async () => {
      const token = await tokenFor(['employee:create', 'employee:update:roles']);
      const higherRole = await prisma.employeeRole.create({
        data: {
          name: `higher-role-${Date.now()}-${counter}`,
          color: '#ff0000',
          position: 1_500_000,
        },
      });
      const email = uniqueEmail('higher-role');

      await request(app.getHttpServer())
        .post('/api/employee')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email,
          password: 'Test1234!',
          firstName: 'Hierarchy',
          lastName: 'Attempt',
          roleAssignments: [{ roleId: higherRole.id, scopeType: 'GLOBAL' }],
        })
        .expect(403);

      expect(await prisma.employee.findUnique({ where: { email } })).toBeNull();
    });

    it('uses the role assignment scope instead of the actor home warehouse', async () => {
      const token = await tokenFor(['employee:create'], uniqueEmail('warehouse-creator'), 1_000, {
        scopeType: 'WAREHOUSE',
        scopeWarehouseId: warehouseAId,
        employeeWarehouseId: warehouseBId,
      });

      await request(app.getHttpServer())
        .post('/api/employee')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: uniqueEmail('warehouse-a-created'),
          password: 'Test1234!',
          firstName: 'Warehouse',
          lastName: 'Allowed',
          warehouseId: warehouseAId,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/employee')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: uniqueEmail('warehouse-b-denied'),
          password: 'Test1234!',
          firstName: 'Warehouse',
          lastName: 'Denied',
          warehouseId: warehouseBId,
        })
        .expect(403);
    });

    it('requires employee:update:roles when assigning roles during creation', async () => {
      const token = await tokenFor(['employee:create']);
      const role = await prisma.employeeRole.create({
        data: {
          name: `create-assignment-${Date.now()}-${counter}`,
          color: '#abcdef',
          position: 1,
        },
      });

      await request(app.getHttpServer())
        .post('/api/employee')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: uniqueEmail('create-with-role-denied'),
          password: 'Test1234!',
          firstName: 'Role',
          lastName: 'Denied',
          roleAssignments: [{ roleId: role.id, scopeType: 'GLOBAL' }],
        })
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /api/employee/me', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/employee/me').expect(401);
    });

    it('returns own profile without password', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/employee/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toMatchObject({ email: ADMIN.email });
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).toHaveProperty('roleAssignments');
      expect(res.body).toHaveProperty('avatarUrl');
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /api/employee/:id', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer()).get(`/api/employee/${targetEmployeeId}`).expect(401);
    });

    it('returns employee by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/employee/${targetEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toMatchObject({ id: targetEmployeeId, email: 'target@e2e.test' });
      expect(res.body).not.toHaveProperty('password');
    });

    it('returns a public URL for a legacy internally-addressed avatar', async () => {
      const oldKey = `avatars/${targetEmployeeId}/legacy.png`;
      await prisma.employee.update({
        where: { id: targetEmployeeId },
        data: { avatarUrl: avatarUrlForKey(oldKey) },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/employee/${targetEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.avatarUrl).toBe(`/storage/test-bucket/${oldKey}`);

      await prisma.employee.update({
        where: { id: targetEmployeeId },
        data: { avatarUrl: null },
      });
    });

    it('returns 404 for non-existent id', async () => {
      await request(app.getHttpServer())
        .get('/api/employee/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('PATCH /api/employee/me', () => {
    let conflictEmail: string;

    beforeAll(async () => {
      conflictEmail = uniqueEmail('conflict');
      await prisma.employee.create({
        data: {
          email: conflictEmail,
          password: await bcrypt.hash('Test1234!', 10),
          firstName: 'Conflict',
          lastName: 'Employee',
        },
      });
    });

    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .patch('/api/employee/me')
        .send({ firstName: 'Updated' })
        .expect(401);
    });

    it('returns 403 without any required permission', async () => {
      const token = await tokenNoPerms();
      await request(app.getHttpServer())
        .patch('/api/employee/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Updated' })
        .expect(403);
    });

    it('updates own profile info', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/employee/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'UpdatedFirst', phone: '+380501234567' })
        .expect(200);

      expect(res.body).toMatchObject({ firstName: 'UpdatedFirst', phone: '+380501234567' });
    });

    it('returns 403 from service when updating email without employee:update:own:email', async () => {
      const token = await tokenFor(['employee:update:own:info']);
      await request(app.getHttpServer())
        .patch('/api/employee/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: uniqueEmail('attempt') })
        .expect(403);
    });

    it('returns 409 when updating email to one already in use', async () => {
      await request(app.getHttpServer())
        .patch('/api/employee/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: conflictEmail })
        .expect(409);
    });
  });

  // ---------------------------------------------------------------------------
  describe('PATCH /api/employee/me/password', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .patch('/api/employee/me/password')
        .send({ currentPassword: ADMIN.password, newPassword: 'NewPass123!' })
        .expect(401);
    });

    it('returns 403 without employee:update:own:password permission', async () => {
      const token = await tokenNoPerms();
      await request(app.getHttpServer())
        .patch('/api/employee/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'Test1234!', newPassword: 'NewPass123!' })
        .expect(403);
    });

    it('returns 401 for wrong current password', async () => {
      await request(app.getHttpServer())
        .patch('/api/employee/me/password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ currentPassword: 'WrongPassword!', newPassword: 'NewPass123!' })
        .expect(401);
    });

    it('updates password and returns success', async () => {
      const newPassword = 'NewPass123!';
      await request(app.getHttpServer())
        .patch('/api/employee/me/password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ currentPassword: ADMIN.password, newPassword })
        .expect(200)
        .expect({ success: true });

      // Restore original password so subsequent tests that rely on login still work
      const emp = await prisma.employee.findUnique({ where: { email: ADMIN.email } });
      await prisma.employee.update({
        where: { id: emp!.id },
        data: { password: await bcrypt.hash(ADMIN.password, 10) },
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /api/employee/me/avatar', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/api/employee/me/avatar')
        .attach('file', TINY_PNG, { filename: 'test.png', contentType: 'image/png' })
        .expect(401);
    });

    it('returns 403 without employee:update:own:avatar permission', async () => {
      const token = await tokenNoPerms();
      await request(app.getHttpServer())
        .post('/api/employee/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', TINY_PNG, { filename: 'test.png', contentType: 'image/png' })
        .expect(403);
    });

    it('returns 400 when no file is provided', async () => {
      await request(app.getHttpServer())
        .post('/api/employee/me/avatar')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('returns 400 for unsupported file type', async () => {
      await request(app.getHttpServer())
        .post('/api/employee/me/avatar')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('not an image'), {
          filename: 'test.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);
    });

    it('returns 400 when the declared image type does not match the file content', async () => {
      await request(app.getHttpServer())
        .post('/api/employee/me/avatar')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('not an image'), {
          filename: 'spoofed.png',
          contentType: 'image/png',
        })
        .expect(400);

      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('uploads avatar and returns avatarUrl', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/employee/me/avatar')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', TINY_PNG, { filename: 'avatar.png', contentType: 'image/png' })
        .expect(201);

      expect(res.body.avatarUrl).toEqual(
        expect.stringMatching(/^http:\/\/minio:9000\/test-bucket\/avatars\/.+\/[^/]+\.png$/),
      );
      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      const [[key]] = mockStorage.upload.mock.calls;
      expect(key).toMatch(/^avatars\/.+\/[^/]+\.png$/);
    });
  });

  // ---------------------------------------------------------------------------
  describe('DELETE /api/employee/me/avatar', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer()).delete('/api/employee/me/avatar').expect(401);
    });

    it('returns 403 without employee:update:own:avatar permission', async () => {
      const token = await tokenNoPerms();
      await request(app.getHttpServer())
        .delete('/api/employee/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('deletes avatar and returns null avatarUrl', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/employee/me/avatar')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toEqual({ avatarUrl: null });
    });
  });

  // ---------------------------------------------------------------------------
  describe('PATCH /api/employee/:id', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .patch(`/api/employee/${targetEmployeeId}`)
        .send({ firstName: 'New' })
        .expect(401);
    });

    it('returns 403 without any required permission', async () => {
      const token = await tokenNoPerms();
      await request(app.getHttpServer())
        .patch(`/api/employee/${targetEmployeeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'New' })
        .expect(403);
    });

    it('updates firstName when caller has employee:update:info', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/employee/${targetEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'UpdatedTarget' })
        .expect(200);

      expect(res.body).toMatchObject({ id: targetEmployeeId, firstName: 'UpdatedTarget' });
    });

    it('returns 403 from service when field permission is missing', async () => {
      // User has employee:toggle:active but tries to update firstName (needs employee:update:info)
      const token = await tokenFor(['employee:toggle:active']);
      await request(app.getHttpServer())
        .patch(`/api/employee/${targetEmployeeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Hacked' })
        .expect(403);
    });

    it('revalidates field permissions after they are revoked from an issued token', async () => {
      const actorEmail = uniqueEmail('revoked-info');
      const token = await tokenFor(['employee:update:info'], actorEmail);
      const actor = await prisma.employee.findUniqueOrThrow({
        where: { email: actorEmail },
        include: { roleAssignments: true },
      });
      await prisma.employeeRolePermission.deleteMany({
        where: { employeeRoleId: actor.roleAssignments[0]!.employeeRoleId },
      });

      await request(app.getHttpServer())
        .patch(`/api/employee/${targetEmployeeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'StaleTokenUpdate' })
        .expect(403);

      expect(
        await prisma.employee.findUniqueOrThrow({ where: { id: targetEmployeeId } }),
      ).toMatchObject({ firstName: 'UpdatedTarget' });
    });

    it('allows a warehouse grant only for employees of that warehouse', async () => {
      const token = await tokenFor(
        ['employee:update:info'],
        uniqueEmail('warehouse-manager'),
        1_000,
        {
          scopeType: 'WAREHOUSE',
          scopeWarehouseId: warehouseAId,
          employeeWarehouseId: warehouseBId,
        },
      );
      const sameWarehouse = await employeeAt('same-warehouse', warehouseAId);
      const otherWarehouse = await employeeAt('other-warehouse', warehouseBId);
      const unassigned = await employeeAt('unassigned', null);

      await request(app.getHttpServer())
        .patch(`/api/employee/${sameWarehouse.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Allowed' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/employee/${otherWarehouse.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Denied' })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/api/employee/${unassigned.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Denied' })
        .expect(403);
    });

    it('allows a regular globally assigned manager to update every warehouse', async () => {
      const token = await tokenFor(['employee:update:info'], uniqueEmail('global-manager'), 1_000);
      const target = await employeeAt('global-manager-target', warehouseBId);

      await request(app.getHttpServer())
        .patch(`/api/employee/${target.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'GloballyManaged' })
        .expect(200);
    });

    it('requires transfer permission and hierarchy coverage for both warehouses', async () => {
      const allowedToken = await tokenFor(
        ['employee:update:warehouse'],
        uniqueEmail('multi-warehouse-manager'),
        1_000,
        {
          scopeType: 'WAREHOUSE',
          scopeWarehouseId: warehouseAId,
          additionalWarehouseIds: [warehouseBId],
        },
      );
      const allowedTarget = await employeeAt('transfer-allowed', warehouseAId);

      await request(app.getHttpServer())
        .patch(`/api/employee/${allowedTarget.id}`)
        .set('Authorization', `Bearer ${allowedToken}`)
        .send({ warehouseId: warehouseBId })
        .expect(200);

      const deniedToken = await tokenFor(
        ['employee:update:warehouse'],
        uniqueEmail('single-warehouse-manager'),
        1_000,
        {
          scopeType: 'WAREHOUSE',
          scopeWarehouseId: warehouseAId,
        },
      );
      const deniedTarget = await employeeAt('transfer-denied', warehouseAId);

      await request(app.getHttpServer())
        .patch(`/api/employee/${deniedTarget.id}`)
        .set('Authorization', `Bearer ${deniedToken}`)
        .send({ warehouseId: warehouseBId })
        .expect(403);

      expect(
        await prisma.employee.findUniqueOrThrow({ where: { id: deniedTarget.id } }),
      ).toMatchObject({ warehouseId: warehouseAId });
    });

    it('only adds and removes role assignments inside controlled scopes', async () => {
      const token = await tokenFor(
        ['employee:update:roles', 'employee:update:info'],
        uniqueEmail('scoped-role-manager'),
        1_000,
        {
          scopeType: 'WAREHOUSE',
          scopeWarehouseId: warehouseAId,
        },
      );
      const lowerRole = await prisma.employeeRole.create({
        data: {
          name: `scoped-lower-role-${Date.now()}-${counter}`,
          color: '#123456',
          position: 10,
          permissions: {
            create: {
              employeePermission: {
                connect: { name: 'employee:update:info' },
              },
            },
          },
        },
      });
      const target = await employeeAt('scoped-role-target', warehouseAId);

      const assigned = await request(app.getHttpServer())
        .patch(`/api/employee/${target.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          roleAssignments: [
            {
              roleId: lowerRole.id,
              scopeType: 'WAREHOUSE',
              warehouseId: warehouseAId,
            },
          ],
        })
        .expect(200);

      expect(assigned.body.roleAssignments).toEqual([
        expect.objectContaining({
          scopeType: 'WAREHOUSE',
          warehouseId: warehouseAId,
          employeeRole: expect.objectContaining({ id: lowerRole.id }),
        }),
      ]);

      await request(app.getHttpServer())
        .patch(`/api/employee/${target.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          roleAssignments: [
            {
              roleId: lowerRole.id,
              scopeType: 'WAREHOUSE',
              warehouseId: warehouseBId,
            },
          ],
        })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/api/employee/${target.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          roleAssignments: [{ roleId: lowerRole.id, scopeType: 'GLOBAL' }],
        })
        .expect(403);

      expect(
        await prisma.employeeRoleAssignment.findMany({
          where: { employeeId: target.id },
          select: { employeeRoleId: true, scopeType: true, warehouseId: true },
        }),
      ).toEqual([
        {
          employeeRoleId: lowerRole.id,
          scopeType: 'WAREHOUSE',
          warehouseId: warehouseAId,
        },
      ]);
    });

    it('preserves unchanged role assignment rows when applying a replacement', async () => {
      const permission = await prisma.employeePermission.findUniqueOrThrow({
        where: { name: 'employee:update:info' },
      });
      const [currentWarehouseARole, nextWarehouseARole, warehouseBRole] = await Promise.all(
        ['current-a', 'next-a', 'stable-b'].map((suffix) =>
          prisma.employeeRole.create({
            data: {
              name: `diff-role-${suffix}-${Date.now()}-${counter}`,
              color: '#123456',
              position: 10,
              permissions: {
                create: { employeePermissionId: permission.id },
              },
            },
          }),
        ),
      );
      const target = await employeeAt('diff-role-target', warehouseAId, [
        {
          employeeRoleId: currentWarehouseARole.id,
          scopeType: 'WAREHOUSE',
          warehouseId: warehouseAId,
        },
        {
          employeeRoleId: warehouseBRole.id,
          scopeType: 'WAREHOUSE',
          warehouseId: warehouseBId,
        },
      ]);
      const stableBefore = await prisma.employeeRoleAssignment.findFirstOrThrow({
        where: {
          employeeId: target.id,
          employeeRoleId: warehouseBRole.id,
          scopeType: 'WAREHOUSE',
          warehouseId: warehouseBId,
        },
      });
      const requestedAssignments = [
        {
          roleId: nextWarehouseARole.id,
          scopeType: 'WAREHOUSE',
          warehouseId: warehouseAId,
        },
        {
          roleId: warehouseBRole.id,
          scopeType: 'WAREHOUSE',
          warehouseId: warehouseBId,
        },
      ];

      await request(app.getHttpServer())
        .patch(`/api/employee/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleAssignments: requestedAssignments })
        .expect(200);

      const stableAfterChange = await prisma.employeeRoleAssignment.findFirstOrThrow({
        where: {
          employeeId: target.id,
          employeeRoleId: warehouseBRole.id,
          scopeType: 'WAREHOUSE',
          warehouseId: warehouseBId,
        },
      });
      expect(stableAfterChange).toMatchObject({
        id: stableBefore.id,
        updatedAt: stableBefore.updatedAt,
      });
      expect(
        await prisma.employeeRoleAssignment.count({
          where: {
            employeeId: target.id,
            employeeRoleId: currentWarehouseARole.id,
          },
        }),
      ).toBe(0);

      await request(app.getHttpServer())
        .patch(`/api/employee/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleAssignments: requestedAssignments })
        .expect(200);

      expect(
        await prisma.employeeRoleAssignment.findUniqueOrThrow({
          where: { id: stableBefore.id },
        }),
      ).toMatchObject({ updatedAt: stableBefore.updatedAt });
    });

    it('does not let a warehouse manager remove a role from another scope', async () => {
      const token = await tokenFor(
        ['employee:update:roles'],
        uniqueEmail('role-removal-manager'),
        1_000,
        {
          scopeType: 'WAREHOUSE',
          scopeWarehouseId: warehouseAId,
        },
      );
      const lowerRole = await prisma.employeeRole.create({
        data: {
          name: `other-scope-role-${Date.now()}-${counter}`,
          color: '#654321',
          position: 10,
          permissions: {
            create: {
              employeePermission: {
                connect: { name: 'employee:update:info' },
              },
            },
          },
        },
      });
      const target = await employeeAt('role-removal-target', warehouseAId, [
        {
          employeeRoleId: lowerRole.id,
          scopeType: 'WAREHOUSE',
          warehouseId: warehouseBId,
        },
      ]);

      await request(app.getHttpServer())
        .patch(`/api/employee/${target.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleAssignments: [] })
        .expect(403);

      expect(
        await prisma.employeeRoleAssignment.count({
          where: { employeeId: target.id, employeeRoleId: lowerRole.id },
        }),
      ).toBe(1);
    });

    it('does not let a lower warehouse manager change assignments of a higher employee', async () => {
      const [manageRolesPermission, scopedPermission] = await Promise.all([
        prisma.employeePermission.findUniqueOrThrow({
          where: { name: 'employee:update:roles' },
        }),
        prisma.employeePermission.findUniqueOrThrow({
          where: { name: 'employee:update:info' },
        }),
      ]);
      const [actorHomeRole, actorOtherWarehouseRole, targetHigherRole, targetLowerRole] =
        await Promise.all([
          prisma.employeeRole.create({
            data: {
              name: `cross-scope-actor-home-${Date.now()}-${counter}`,
              color: '#111111',
              position: 200,
              permissions: {
                create: { employeePermissionId: manageRolesPermission.id },
              },
            },
          }),
          prisma.employeeRole.create({
            data: {
              name: `cross-scope-actor-other-${Date.now()}-${counter}`,
              color: '#222222',
              position: 60,
              permissions: {
                create: { employeePermissionId: manageRolesPermission.id },
              },
            },
          }),
          prisma.employeeRole.create({
            data: {
              name: `cross-scope-target-higher-${Date.now()}-${counter}`,
              color: '#333333',
              position: 100,
              permissions: {
                create: { employeePermissionId: scopedPermission.id },
              },
            },
          }),
          prisma.employeeRole.create({
            data: {
              name: `cross-scope-target-lower-${Date.now()}-${counter}`,
              color: '#444444',
              position: 50,
              permissions: {
                create: { employeePermissionId: scopedPermission.id },
              },
            },
          }),
        ]);
      const actorEmail = uniqueEmail('cross-scope-assignment-actor');
      const password = 'Test1234!';
      await prisma.employee.create({
        data: {
          email: actorEmail,
          password: await bcrypt.hash(password, 10),
          firstName: 'CrossScope',
          lastName: 'Actor',
          warehouseId: warehouseAId,
          roleAssignments: {
            create: [
              {
                employeeRoleId: actorHomeRole.id,
                scopeType: 'WAREHOUSE',
                warehouseId: warehouseAId,
              },
              {
                employeeRoleId: actorOtherWarehouseRole.id,
                scopeType: 'WAREHOUSE',
                warehouseId: warehouseBId,
              },
            ],
          },
        },
      });
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: actorEmail, password })
        .expect(200);
      const target = await employeeAt('cross-scope-assignment-target', warehouseAId, [
        {
          employeeRoleId: targetHigherRole.id,
          scopeType: 'WAREHOUSE',
          warehouseId: warehouseBId,
        },
        {
          employeeRoleId: targetLowerRole.id,
          scopeType: 'WAREHOUSE',
          warehouseId: warehouseBId,
        },
      ]);

      await request(app.getHttpServer())
        .patch(`/api/employee/${target.id}`)
        .set('Authorization', `Bearer ${login.body.access_token}`)
        .send({
          roleAssignments: [
            {
              roleId: targetHigherRole.id,
              scopeType: 'WAREHOUSE',
              warehouseId: warehouseBId,
            },
          ],
        })
        .expect(403);

      expect(
        await prisma.employeeRoleAssignment.count({
          where: { employeeId: target.id },
        }),
      ).toBe(2);
    });

    it('rejects the removed roleIds field without changing the employee', async () => {
      const role = await prisma.employeeRole.create({
        data: {
          name: `legacy-scope-role-${Date.now()}-${counter}`,
          color: '#456789',
          position: 10,
          permissions: {
            create: {
              employeePermission: {
                connect: { name: 'employee:update:info' },
              },
            },
          },
        },
      });
      const target = await employeeAt('legacy-scope-target', warehouseAId, [
        {
          employeeRoleId: role.id,
          scopeType: 'WAREHOUSE',
          warehouseId: warehouseAId,
        },
      ]);

      await request(app.getHttpServer())
        .patch(`/api/employee/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'MustRollback', roleIds: [role.id] })
        .expect(400);

      expect(
        await prisma.employee.findUniqueOrThrow({
          where: { id: target.id },
          include: { roleAssignments: true },
        }),
      ).toMatchObject({
        firstName: 'legacy-scope-target',
        roleAssignments: [
          expect.objectContaining({
            scopeType: 'WAREHOUSE',
            warehouseId: warehouseAId,
          }),
        ],
      });
    });

    it('does not leak a high warehouse role into another scope hierarchy', async () => {
      const permission = await prisma.employeePermission.findUniqueOrThrow({
        where: { name: 'employee:update:info' },
      });
      const [highWarehouseRole, lowGlobalRole, protectedTargetRole] = await Promise.all([
        prisma.employeeRole.create({
          data: {
            name: `high-warehouse-role-${Date.now()}-${counter}`,
            color: '#111111',
            position: 100,
            permissions: {
              create: { employeePermissionId: permission.id },
            },
          },
        }),
        prisma.employeeRole.create({
          data: {
            name: `low-global-role-${Date.now()}-${counter}`,
            color: '#222222',
            position: 10,
            permissions: {
              create: { employeePermissionId: permission.id },
            },
          },
        }),
        prisma.employeeRole.create({
          data: {
            name: `protected-target-role-${Date.now()}-${counter}`,
            color: '#333333',
            position: 50,
            permissions: {
              create: { employeePermissionId: permission.id },
            },
          },
        }),
      ]);
      const actorEmail = uniqueEmail('contextual-hierarchy-actor');
      const password = 'Test1234!';
      await prisma.employee.create({
        data: {
          email: actorEmail,
          password: await bcrypt.hash(password, 10),
          firstName: 'Contextual',
          lastName: 'Actor',
          warehouseId: warehouseAId,
          roleAssignments: {
            create: [
              {
                employeeRoleId: highWarehouseRole.id,
                scopeType: 'WAREHOUSE',
                warehouseId: warehouseAId,
              },
              {
                employeeRoleId: lowGlobalRole.id,
                scopeType: 'GLOBAL',
              },
            ],
          },
        },
      });
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: actorEmail, password })
        .expect(200);
      const target = await employeeAt('contextual-hierarchy-target', warehouseBId, [
        {
          employeeRoleId: protectedTargetRole.id,
          scopeType: 'WAREHOUSE',
          warehouseId: warehouseBId,
        },
      ]);

      await request(app.getHttpServer())
        .patch(`/api/employee/${target.id}`)
        .set('Authorization', `Bearer ${login.body.access_token}`)
        .send({ firstName: 'Forbidden' })
        .expect(403);
    });

    it('grants system-wide permissions globally while restricting resource permissions to the warehouse', async () => {
      const [systemPermission, scopedPermission] = await Promise.all([
        prisma.employeePermission.findUniqueOrThrow({
          where: { name: 'role:create' },
        }),
        prisma.employeePermission.findUniqueOrThrow({
          where: { name: 'employee:update:info' },
        }),
      ]);
      const mixedRole = await prisma.employeeRole.create({
        data: {
          name: `mixed-scope-role-${Date.now()}-${counter}`,
          color: '#999999',
          position: 100,
          permissions: {
            create: [
              { employeePermissionId: systemPermission.id },
              { employeePermissionId: scopedPermission.id },
            ],
          },
        },
      });
      const actorEmail = uniqueEmail('mixed-scope-actor');
      const actor = await prisma.employee.create({
        data: {
          email: actorEmail,
          password: await bcrypt.hash('Test1234!', 10),
          firstName: 'MixedScope',
          lastName: 'Actor',
          warehouseId: warehouseAId,
          roleAssignments: {
            create: {
              employeeRoleId: mixedRole.id,
              scopeType: 'WAREHOUSE',
              warehouseId: warehouseAId,
            },
          },
        },
      });
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: actorEmail, password: 'Test1234!' })
        .expect(200);
      const token = login.body.access_token as string;
      const [sameWarehouseTarget, otherWarehouseTarget] = await Promise.all([
        employeeAt('mixed-scope-same-warehouse', warehouseAId),
        employeeAt('mixed-scope-other-warehouse', warehouseBId),
      ]);

      await request(app.getHttpServer())
        .post('/api/role')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `created-by-mixed-scope-${Date.now()}-${counter}`,
          color: '#778899',
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/employee/${sameWarehouseTarget.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Allowed' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/employee/${otherWarehouseTarget.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Forbidden' })
        .expect(403);

      expect(
        await prisma.employee.findUniqueOrThrow({
          where: { id: actor.id },
          select: { roleAssignments: true },
        }),
      ).toMatchObject({
        roleAssignments: [
          expect.objectContaining({
            scopeType: 'WAREHOUSE',
            warehouseId: warehouseAId,
          }),
        ],
      });
    });

    it('rejects redundant global and warehouse bindings for the same role', async () => {
      const role = await prisma.employeeRole.create({
        data: {
          name: `overlapping-scope-role-${Date.now()}-${counter}`,
          color: '#987654',
          position: 1,
          permissions: {
            create: {
              employeePermission: {
                connect: { name: 'employee:update:info' },
              },
            },
          },
        },
      });
      const target = await employeeAt('overlapping-scope-target', warehouseAId);

      await request(app.getHttpServer())
        .patch(`/api/employee/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roleAssignments: [
            { roleId: role.id, scopeType: 'GLOBAL' },
            {
              roleId: role.id,
              scopeType: 'WAREHOUSE',
              warehouseId: warehouseAId,
            },
          ],
        })
        .expect(400);

      expect(await prisma.employeeRoleAssignment.count({ where: { employeeId: target.id } })).toBe(
        0,
      );
    });

    it('does not let a non-superadmin change a protected account', async () => {
      const token = await tokenFor(['employee:update:password']);
      await request(app.getHttpServer())
        .patch(`/api/employee/${adminEmployeeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'Compromised123!' })
        .expect(403);
    });

    it('does not let an employee manage someone with an equal highest role', async () => {
      const actorPosition = 500;
      const token = await tokenFor(
        ['employee:update:info'],
        uniqueEmail('equal-role-actor'),
        actorPosition,
      );
      const equalRole = await prisma.employeeRole.create({
        data: {
          name: `equal-target-role-${Date.now()}-${counter}`,
          color: '#ff0000',
          position: actorPosition,
        },
      });
      const equalTarget = await prisma.employee.create({
        data: {
          email: uniqueEmail('equal-role-target'),
          password: await bcrypt.hash('Test1234!', 10),
          firstName: 'Equal',
          lastName: 'Target',
          roleAssignments: {
            create: { employeeRoleId: equalRole.id, scopeType: 'GLOBAL' },
          },
        },
      });

      await request(app.getHttpServer())
        .patch(`/api/employee/${equalTarget.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Forbidden' })
        .expect(403);

      expect(
        await prisma.employee.findUniqueOrThrow({ where: { id: equalTarget.id } }),
      ).toMatchObject({ firstName: 'Equal' });
    });

    it('syncs scoped role assignments atomically', async () => {
      const role = await prisma.employeeRole.create({
        data: { name: `synced-role-${Date.now()}`, color: '#ff0000' },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/employee/${targetEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleAssignments: [{ roleId: role.id, scopeType: 'GLOBAL' }] })
        .expect(200);

      expect(res.body.roleAssignments).toHaveLength(1);
      expect(res.body.roleAssignments[0].employeeRole.id).toBe(role.id);
      expect(res.body.roleAssignments[0]).toMatchObject({
        scopeType: 'GLOBAL',
        warehouseId: null,
      });
    });

    it('keeps existing roles when one requested role does not exist', async () => {
      const currentRole = await prisma.employeeRole.create({
        data: { name: `current-role-${Date.now()}-${counter}`, color: '#00ff00' },
      });
      await prisma.employeeRoleAssignment.deleteMany({
        where: { employeeId: targetEmployeeId },
      });
      await prisma.employeeRoleAssignment.create({
        data: {
          employeeId: targetEmployeeId,
          employeeRoleId: currentRole.id,
          scopeType: 'GLOBAL',
        },
      });

      await request(app.getHttpServer())
        .patch(`/api/employee/${targetEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roleAssignments: [
            { roleId: currentRole.id, scopeType: 'GLOBAL' },
            { roleId: 2147483647, scopeType: 'GLOBAL' },
          ],
        })
        .expect(400);

      const assignments = await prisma.employeeRoleAssignment.findMany({
        where: { employeeId: targetEmployeeId },
      });
      expect(assignments.map(({ employeeRoleId }) => employeeRoleId)).toEqual([currentRole.id]);
    });

    it('clears roles when roleAssignments is empty', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/employee/${targetEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleAssignments: [] })
        .expect(200);

      expect(res.body.roleAssignments).toHaveLength(0);
    });

    it('does not let a non-superadmin assign the protected role', async () => {
      const token = await tokenFor(['employee:update:roles']);
      const superadminRole = await prisma.employeeRole.findUniqueOrThrow({
        where: { name: 'superadmin' },
      });

      await request(app.getHttpServer())
        .patch(`/api/employee/${targetEmployeeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleAssignments: [{ roleId: superadminRole.id, scopeType: 'GLOBAL' }] })
        .expect(403);
    });

    it('does not remove the last global superadmin assignment', async () => {
      await request(app.getHttpServer())
        .patch(`/api/employee/${adminEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleAssignments: [] })
        .expect(403);
    });

    it('allows removing a superadmin assignment when another active superadmin remains', async () => {
      const superadminRole = await prisma.employeeRole.findUniqueOrThrow({
        where: { name: 'superadmin' },
      });
      const secondSuperadmin = await prisma.employee.create({
        data: {
          email: uniqueEmail('second-superadmin'),
          password: await bcrypt.hash('Test1234!', 10),
          firstName: 'Second',
          lastName: 'Superadmin',
          roleAssignments: {
            create: {
              employeeRoleId: superadminRole.id,
              scopeType: 'GLOBAL',
            },
          },
        },
      });

      try {
        await request(app.getHttpServer())
          .patch(`/api/employee/${adminEmployeeId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ roleAssignments: [] })
          .expect(200);

        expect(
          await prisma.employeeRoleAssignment.count({
            where: {
              employeeId: adminEmployeeId,
              employeeRoleId: superadminRole.id,
            },
          }),
        ).toBe(0);
      } finally {
        const adminAssignment = await prisma.employeeRoleAssignment.findFirst({
          where: {
            employeeId: adminEmployeeId,
            employeeRoleId: superadminRole.id,
            scopeType: 'GLOBAL',
          },
          select: { id: true },
        });
        if (!adminAssignment) {
          await prisma.employeeRoleAssignment.create({
            data: {
              employeeId: adminEmployeeId,
              employeeRoleId: superadminRole.id,
              scopeType: 'GLOBAL',
            },
          });
        }
        await prisma.employeeRoleAssignment.deleteMany({
          where: { employeeId: secondSuperadmin.id },
        });
        await prisma.employee.delete({ where: { id: secondSuperadmin.id } });
      }
    });

    it('does not deactivate the last active global superadmin', async () => {
      await request(app.getHttpServer())
        .patch(`/api/employee/${adminEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(403);

      expect(
        await prisma.employee.findUniqueOrThrow({ where: { id: adminEmployeeId } }),
      ).toMatchObject({ isActive: true });
    });

    it('toggles isActive to false', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/employee/${targetEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);

      expect(res.body.isActive).toBe(false);
    });

    it('returns 404 for non-existent employee', async () => {
      await request(app.getHttpServer())
        .patch('/api/employee/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'Ghost' })
        .expect(404);
    });

    it('returns 409 when email is already taken', async () => {
      await request(app.getHttpServer())
        .patch(`/api/employee/${targetEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: ADMIN.email })
        .expect(409);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /api/employee/:id/avatar', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post(`/api/employee/${targetEmployeeId}/avatar`)
        .attach('file', TINY_PNG, { filename: 'test.png', contentType: 'image/png' })
        .expect(401);
    });

    it('returns 403 without employee:update:avatar permission', async () => {
      const token = await tokenNoPerms();
      await request(app.getHttpServer())
        .post(`/api/employee/${targetEmployeeId}/avatar`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', TINY_PNG, { filename: 'test.png', contentType: 'image/png' })
        .expect(403);
    });

    it('does not accept the own-avatar permission for another employee', async () => {
      const token = await tokenFor(['employee:update:own:avatar']);
      await request(app.getHttpServer())
        .post(`/api/employee/${targetEmployeeId}/avatar`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', TINY_PNG, { filename: 'avatar.png', contentType: 'image/png' })
        .expect(403);
    });

    it('does not let a non-superadmin change a protected account avatar', async () => {
      const token = await tokenFor(['employee:update:avatar']);
      await request(app.getHttpServer())
        .post(`/api/employee/${adminEmployeeId}/avatar`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', TINY_PNG, { filename: 'avatar.png', contentType: 'image/png' })
        .expect(403);
    });

    it('revalidates the avatar permission before uploading for another employee', async () => {
      const actorEmail = uniqueEmail('revoked-avatar');
      const token = await tokenFor(['employee:update:avatar'], actorEmail);
      const actor = await prisma.employee.findUniqueOrThrow({
        where: { email: actorEmail },
        include: { roleAssignments: true },
      });
      await prisma.employeeRolePermission.deleteMany({
        where: { employeeRoleId: actor.roleAssignments[0]!.employeeRoleId },
      });

      await request(app.getHttpServer())
        .post(`/api/employee/${targetEmployeeId}/avatar`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', TINY_PNG, { filename: 'avatar.png', contentType: 'image/png' })
        .expect(403);

      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('returns 400 when no file is provided', async () => {
      await request(app.getHttpServer())
        .post(`/api/employee/${targetEmployeeId}/avatar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('uploads avatar for employee and returns avatarUrl', async () => {
      const oldKey = `avatars/${targetEmployeeId}/old.png`;
      await prisma.employee.update({
        where: { id: targetEmployeeId },
        data: { avatarUrl: avatarUrlForKey(oldKey) },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/employee/${targetEmployeeId}/avatar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', TINY_PNG, { filename: 'avatar.png', contentType: 'image/png' })
        .expect(201);

      expect(res.body.avatarUrl).toEqual(
        expect.stringMatching(/^http:\/\/minio:9000\/test-bucket\/avatars\/.+\/[^/]+\.png$/),
      );
      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      const [[newKey]] = mockStorage.upload.mock.calls;
      expect(newKey).toMatch(new RegExp(`^avatars/${targetEmployeeId}/[^/]+\\.png$`));
      expect(newKey).not.toBe(oldKey);
      expect(mockStorage.delete).toHaveBeenCalledWith(oldKey);
      expect(mockStorage.upload.mock.invocationCallOrder[0]).toBeLessThan(
        mockStorage.delete.mock.invocationCallOrder[0]!,
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('DELETE /api/employee/:id/avatar', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/employee/${targetEmployeeId}/avatar`)
        .expect(401);
    });

    it('returns 403 without employee:update:avatar permission', async () => {
      const token = await tokenNoPerms();
      await request(app.getHttpServer())
        .delete(`/api/employee/${targetEmployeeId}/avatar`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('deletes avatar for employee and returns null avatarUrl', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/employee/${targetEmployeeId}/avatar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toEqual({ avatarUrl: null });
    });
  });
});
