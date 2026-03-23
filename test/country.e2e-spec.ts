import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { cleanDatabase, createApp, seedAdmin } from './helpers';

describe('Country (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);
    ({ access_token: accessToken } = await seedAdmin(app));
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  describe('POST /api/country', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/api/country')
        .send({ code: 'AU', name: 'Australia' })
        .expect(401);
    });

    it('creates a country', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/country')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: 'AU', name: 'Australia' })
        .expect(201);

      expect(res.body).toMatchObject({ code: 'AU', name: 'Australia' });
      expect(res.body).toHaveProperty('id');
    });

    it('returns 400 for invalid code length', async () => {
      await request(app.getHttpServer())
        .post('/api/country')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: 'AUS', name: 'Australia' })
        .expect(400);
    });
  });
});
