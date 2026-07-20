import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ADMIN, cleanDatabase, createApp, extractCookie, seedAdmin } from './helpers';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);
    await seedAdmin(app);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  // -------------------------------------------------------------------------
  describe('POST /api/auth/login', () => {
    it('returns access_token and sets refresh cookie on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: ADMIN.password })
        .expect(200);

      expect(res.body).toHaveProperty('access_token');
      expect(extractCookie(res, 'refresh_token')).toBeDefined();
    });

    it('returns 401 on wrong password', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: 'wrong-password' })
        .expect(401);
    });

    it('returns 401 on unknown email', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: ADMIN.password })
        .expect(401);
    });

    it('returns 401 for inactive user', async () => {
      const hashedPassword = await bcrypt.hash('Test1234!', 10);
      await prisma.employee.create({
        data: {
          email: 'inactive@test.com',
          password: hashedPassword,
          firstName: 'Inactive',
          lastName: 'User',
          isActive: false,
        },
      });

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'inactive@test.com', password: 'Test1234!' })
        .expect(401);
    });
  });

  // -------------------------------------------------------------------------
  describe('POST /api/auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: ADMIN.password });

      refreshToken = extractCookie(res, 'refresh_token')!;
    });

    it('rotates token: returns new access_token and sets new refresh cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${refreshToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('access_token');
      expect(res.body).not.toHaveProperty('refresh_token'); // cookie mode: no token in body
      const newCookie = extractCookie(res, 'refresh_token');
      expect(newCookie).toBeDefined();
      expect(newCookie).not.toBe(refreshToken);
    });

    it('returns 401 on reused (already rotated) refresh token', async () => {
      // First refresh — consumes the token
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${refreshToken}`)
        .expect(200);

      // Second refresh with the same token — must fail
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${refreshToken}`)
        .expect(401);
    });

    it('returns 401 with no cookie and no body token', async () => {
      await request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
    });

    it('returns 401 when the employee was deactivated after login', async () => {
      const employee = await prisma.employee.findUniqueOrThrow({
        where: { email: ADMIN.email },
      });

      await prisma.employee.update({
        where: { id: employee.id },
        data: { isActive: false },
      });

      try {
        await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('Cookie', `refresh_token=${refreshToken}`)
          .expect(401);
      } finally {
        await prisma.employee.update({
          where: { id: employee.id },
          data: { isActive: true },
        });
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('POST /api/auth/logout', () => {
    it('clears cookie and invalidates refresh token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: ADMIN.password });

      const accessToken = loginRes.body.access_token as string;
      const refreshToken = extractCookie(loginRes, 'refresh_token')!;

      // Logout
      const logoutRes = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', `refresh_token=${refreshToken}`)
        .expect(200);

      expect(logoutRes.body).toEqual({ success: true });

      // Refresh with the invalidated token must fail
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${refreshToken}`)
        .expect(401);
    });

    it('returns 401 without access token', async () => {
      await request(app.getHttpServer()).post('/api/auth/logout').expect(401);
    });
  });
});
