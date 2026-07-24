import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ADMIN, cleanDatabase, createApp, extractCookie } from './helpers';

describe('Setup (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  describe('GET /api/setup/status', () => {
    it('returns setupRequired: true before init', async () => {
      const res = await request(app.getHttpServer()).get('/api/setup/status').expect(200);

      expect(res.body).toEqual({ setupRequired: true });
    });
  });

  describe('POST /api/setup/init', () => {
    it('rejects an invalid initialization payload', async () => {
      await request(app.getHttpServer())
        .post('/api/setup/init')
        .send({ email: 'invalid', password: 'short', firstName: '', lastName: '' })
        .expect(400);
    });

    it('serializes concurrent initialization attempts', async () => {
      const attempts = await Promise.all([
        request(app.getHttpServer()).post('/api/setup/init').send(ADMIN),
        request(app.getHttpServer()).post('/api/setup/init').send({
          email: 'other-admin@test.com',
          password: 'Other1234!',
          firstName: 'Other',
          lastName: 'Admin',
        }),
      ]);

      expect(attempts.map(({ status }) => status).sort()).toEqual([201, 403]);
      const res = attempts.find(({ status }) => status === 201);
      expect(res).toBeDefined();
      if (!res) throw new Error('Expected one successful setup response');

      expect(res.body).toHaveProperty('access_token');
      expect(extractCookie(res, 'device_session')).toBeDefined();

      const [employees, productTypes, defaultPriceLists, settings] = await Promise.all([
        prisma.employee.findMany(),
        prisma.productType.findMany(),
        prisma.priceList.findMany({ where: { isDefault: true } }),
        prisma.serverSettings.findUnique({ where: { id: 1 } }),
      ]);

      expect(employees).toHaveLength(1);
      expect(productTypes).toHaveLength(1);
      expect(productTypes[0]).toMatchObject({
        name: 'Default',
        defaultWriteoffStrategy: 'FIFO',
        skuMode: 'GLOBAL',
      });
      expect(defaultPriceLists).toHaveLength(1);
      expect(defaultPriceLists[0]).toMatchObject({
        name: 'Default',
        currency: 'EUR',
        isDefault: true,
      });
      expect(settings?.setupCompleted).toBe(true);
    });

    it('returns 403 when setup already done', async () => {
      await request(app.getHttpServer()).post('/api/setup/init').send(ADMIN).expect(403);
    });
  });

  describe('GET /api/setup/status', () => {
    it('returns setupRequired: false after init', async () => {
      const res = await request(app.getHttpServer()).get('/api/setup/status').expect(200);

      expect(res.body).toEqual({ setupRequired: false });
    });
  });
});
