import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RedisService } from '../src/common/redis/redis.service';
import { ADMIN, cleanDatabase, createApp, extractCookie, seedAdmin } from './helpers';

const DEVICE_SESSION_COOKIE = 'device_session';

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

  describe('POST /api/auth/login', () => {
    it('returns an access token and adds the account to the device session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: ADMIN.password })
        .expect(200);

      expect(res.body).toHaveProperty('access_token');
      expect(extractCookie(res, DEVICE_SESSION_COOKIE)).toBeDefined();
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

    it('returns 401 for an inactive account', async () => {
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

    it('does not revoke a legacy session from an unverified cookie', async () => {
      const admin = await prisma.employee.findUniqueOrThrow({ where: { email: ADMIN.email } });
      const jti = `forged-legacy-${Date.now()}`;
      const key = `refresh:${admin.id}:${jti}`;
      const jwtService = app.get(JwtService);
      const redis = app.get(RedisService);
      const forgedRefreshToken = jwtService.sign(
        { sub: admin.id, jti },
        { secret: 'not-the-refresh-secret', expiresIn: '30d' },
      );
      await redis.set(key, '1', 'EX', 60);

      try {
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .set('Cookie', `refresh_token=${forgedRefreshToken}`)
          .send({ email: ADMIN.email, password: ADMIN.password })
          .expect(200);

        expect(await redis.exists(key)).toBe(1);
      } finally {
        await redis.del(key);
      }
    });
  });

  describe('device accounts', () => {
    it('adds, lists, activates and removes accounts independently', async () => {
      const secondPassword = 'Second1234!';
      const secondAccount = await prisma.employee.create({
        data: {
          email: 'second@test.com',
          password: await bcrypt.hash(secondPassword, 10),
          firstName: 'Second',
          lastName: 'User',
        },
      });
      const admin = await prisma.employee.findUniqueOrThrow({ where: { email: ADMIN.email } });

      const adminLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: ADMIN.password })
        .expect(200);
      const initialDeviceSession = extractCookie(adminLogin, DEVICE_SESSION_COOKIE)!;

      const secondLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', `${DEVICE_SESSION_COOKIE}=${initialDeviceSession}`)
        .send({ email: secondAccount.email, password: secondPassword })
        .expect(200);
      const deviceSession = extractCookie(secondLogin, DEVICE_SESSION_COOKIE)!;
      expect(deviceSession).not.toBe(initialDeviceSession);

      await request(app.getHttpServer())
        .post(`/api/auth/accounts/${admin.id}/activate`)
        .set('Cookie', `${DEVICE_SESSION_COOKIE}=${initialDeviceSession}`)
        .expect(401);

      const accounts = await request(app.getHttpServer())
        .get('/api/auth/accounts')
        .set('Cookie', `${DEVICE_SESSION_COOKIE}=${deviceSession}`)
        .expect(200);
      expect(accounts.body.accounts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ accountId: admin.id }),
          expect.objectContaining({ accountId: secondAccount.id }),
        ]),
      );
      expect(accounts.body.accounts).toEqual(
        expect.not.arrayContaining([expect.objectContaining({ email: expect.anything() })]),
      );

      const activation = await request(app.getHttpServer())
        .post(`/api/auth/accounts/${admin.id}/activate`)
        .set('Cookie', `${DEVICE_SESSION_COOKIE}=${deviceSession}`)
        .expect(200);
      const me = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${activation.body.access_token as string}`)
        .expect(200);
      expect(me.body.id).toBe(admin.id);

      await request(app.getHttpServer())
        .delete(`/api/auth/accounts/${secondAccount.id}`)
        .set('Cookie', `${DEVICE_SESSION_COOKIE}=${deviceSession}`)
        .expect(200);

      const remainingAccounts = await request(app.getHttpServer())
        .get('/api/auth/accounts')
        .set('Cookie', `${DEVICE_SESSION_COOKIE}=${deviceSession}`)
        .expect(200);
      expect(remainingAccounts.body.accounts).toEqual([
        expect.objectContaining({ accountId: admin.id }),
      ]);

      await request(app.getHttpServer())
        .post(`/api/auth/accounts/${secondAccount.id}/activate`)
        .set('Cookie', `${DEVICE_SESSION_COOKIE}=${deviceSession}`)
        .expect(401);
    });

    it('removes a deactivated account without affecting other memberships', async () => {
      const admin = await prisma.employee.findUniqueOrThrow({ where: { email: ADMIN.email } });
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: ADMIN.password })
        .expect(200);
      const deviceSession = extractCookie(login, DEVICE_SESSION_COOKIE)!;

      await prisma.employee.update({ where: { id: admin.id }, data: { isActive: false } });
      try {
        await request(app.getHttpServer())
          .post(`/api/auth/accounts/${admin.id}/activate`)
          .set('Cookie', `${DEVICE_SESSION_COOKIE}=${deviceSession}`)
          .expect(401);

        const accounts = await request(app.getHttpServer())
          .get('/api/auth/accounts')
          .set('Cookie', `${DEVICE_SESSION_COOKIE}=${deviceSession}`)
          .expect(200);
        expect(accounts.body.accounts).toEqual([]);
      } finally {
        await prisma.employee.update({ where: { id: admin.id }, data: { isActive: true } });
      }
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('refreshes the explicitly requested device account repeatedly', async () => {
      const admin = await prisma.employee.findUniqueOrThrow({ where: { email: ADMIN.email } });
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: ADMIN.password })
        .expect(200);
      const deviceSession = extractCookie(login, DEVICE_SESSION_COOKIE)!;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const res = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('Cookie', `${DEVICE_SESSION_COOKIE}=${deviceSession}`)
          .send({ accountId: admin.id })
          .expect(200);
        expect(res.body).toHaveProperty('access_token');
        expect(res.body).not.toHaveProperty('refresh_token');
      }
    });

    it('returns 401 without a device session', async () => {
      const admin = await prisma.employee.findUniqueOrThrow({ where: { email: ADMIN.email } });
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ accountId: admin.id })
        .expect(401);
    });

    it('returns 400 for a malformed account id', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: ADMIN.password })
        .expect(200);
      const deviceSession = extractCookie(login, DEVICE_SESSION_COOKIE)!;

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', `${DEVICE_SESSION_COOKIE}=${deviceSession}`)
        .send({ accountId: 'not-a-uuid' })
        .expect(400);
    });

    it('migrates the previous refresh cookie to a device session once', async () => {
      const admin = await prisma.employee.findUniqueOrThrow({ where: { email: ADMIN.email } });
      const jti = `legacy-${Date.now()}`;
      const jwtService = app.get(JwtService);
      const configService = app.get(ConfigService);
      const redis = app.get(RedisService);
      const legacyRefreshToken = jwtService.sign(
        { sub: admin.id, jti },
        {
          secret: configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: '30d',
        },
      );
      await redis.set(`refresh:${admin.id}:${jti}`, '1', 'EX', 60);

      const attempts = await Promise.all([
        request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('Cookie', `refresh_token=${legacyRefreshToken}`)
          .send({ accountId: admin.id }),
        request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('Cookie', `refresh_token=${legacyRefreshToken}`)
          .send({ accountId: admin.id }),
      ]);
      expect(attempts.map((attempt) => attempt.status).sort()).toEqual([200, 401]);
      const migrated = attempts.find((attempt) => attempt.status === 200)!;
      expect(migrated.body).toHaveProperty('access_token');
      expect(extractCookie(migrated, DEVICE_SESSION_COOKIE)).toBeDefined();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('removes only the current account from a multi-account device session', async () => {
      const secondPassword = 'Logout1234!';
      const secondAccount = await prisma.employee.create({
        data: {
          email: 'logout-second@test.com',
          password: await bcrypt.hash(secondPassword, 10),
          firstName: 'Logout',
          lastName: 'Second',
        },
      });

      const adminLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: ADMIN.password });
      const deviceSession = extractCookie(adminLogin, DEVICE_SESSION_COOKIE)!;
      const secondLogin = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Cookie', `${DEVICE_SESSION_COOKIE}=${deviceSession}`)
        .send({ email: secondAccount.email, password: secondPassword });
      const rotatedDeviceSession = extractCookie(secondLogin, DEVICE_SESSION_COOKIE)!;

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${secondLogin.body.access_token as string}`)
        .set('Cookie', `${DEVICE_SESSION_COOKIE}=${rotatedDeviceSession}`)
        .expect(200);

      const accounts = await request(app.getHttpServer())
        .get('/api/auth/accounts')
        .set('Cookie', `${DEVICE_SESSION_COOKIE}=${rotatedDeviceSession}`)
        .expect(200);
      expect(accounts.body.accounts).toHaveLength(1);
      const admin = await prisma.employee.findUniqueOrThrow({ where: { email: ADMIN.email } });
      expect(accounts.body.accounts[0].accountId).toBe(admin.id);
    });

    it('returns 401 without an access token', async () => {
      await request(app.getHttpServer()).post('/api/auth/logout').expect(401);
    });
  });
});
