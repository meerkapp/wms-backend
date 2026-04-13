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

const MOCK_AVATAR_URL = 'http://minio:9000/test-bucket/avatars/test.png';

const mockStorage = {
  upload: jest.fn().mockResolvedValue(MOCK_AVATAR_URL),
  delete: jest.fn().mockResolvedValue(undefined),
  bucket: 'test-bucket',
};

describe('Employee (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let targetEmployeeId: string;

  let counter = 0;
  const uniqueEmail = (prefix = 'user') => `${prefix}-${++counter}@e2e.test`;

  // Creates an employee with the given permissions and returns their access token.
  async function tokenFor(permissions: string[], email = uniqueEmail('limited')): Promise<string> {
    const password = 'Test1234!';
    const role = await prisma.employeeRole.create({
      data: { name: `role-${Date.now()}-${counter}`, color: '#aaaaaa' },
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
        roleAssignments: { create: { employeeRoleId: role.id } },
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

  beforeAll(async () => {
    app = await createApp([{ token: StorageService, value: mockStorage }]);
    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);
    ({ access_token: adminToken } = await seedAdmin(app));

    // Shared target employee used across multiple test groups
    const emp = await prisma.employee.create({
      data: {
        email: 'target@e2e.test',
        password: await bcrypt.hash('Test1234!', 10),
        firstName: 'Target',
        lastName: 'Employee',
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
    mockStorage.upload.mockResolvedValue(MOCK_AVATAR_URL);
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
      await request(app.getHttpServer())
        .get(`/api/employee/${targetEmployeeId}`)
        .expect(401);
    });

    it('returns employee by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/employee/${targetEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toMatchObject({ id: targetEmployeeId, email: 'target@e2e.test' });
      expect(res.body).not.toHaveProperty('password');
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

    it('uploads avatar and returns avatarUrl', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/employee/me/avatar')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', TINY_PNG, { filename: 'avatar.png', contentType: 'image/png' })
        .expect(201);

      expect(res.body).toMatchObject({ avatarUrl: MOCK_AVATAR_URL });
      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      const [[key]] = mockStorage.upload.mock.calls;
      expect(key).toMatch(/^avatars\/.+\.png$/);
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

    it('syncs roles atomically when roleIds provided', async () => {
      const role = await prisma.employeeRole.create({
        data: { name: `synced-role-${Date.now()}`, color: '#ff0000' },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/employee/${targetEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleIds: [role.id] })
        .expect(200);

      expect(res.body.roleAssignments).toHaveLength(1);
      expect(res.body.roleAssignments[0].employeeRole.id).toBe(role.id);
    });

    it('clears roles when roleIds is empty array', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/employee/${targetEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleIds: [] })
        .expect(200);

      expect(res.body.roleAssignments).toHaveLength(0);
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

    it('returns 400 when no file is provided', async () => {
      await request(app.getHttpServer())
        .post(`/api/employee/${targetEmployeeId}/avatar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('uploads avatar for employee and returns avatarUrl', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/employee/${targetEmployeeId}/avatar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', TINY_PNG, { filename: 'avatar.png', contentType: 'image/png' })
        .expect(201);

      expect(res.body).toMatchObject({ avatarUrl: MOCK_AVATAR_URL });
      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
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
