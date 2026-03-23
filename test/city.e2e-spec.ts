import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { cleanDatabase, createApp, seedAdmin } from './helpers';

describe('City (e2e)', () => {
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

  describe('POST /api/city', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/api/city')
        .send({ name: 'Sydney', countryId: 1 })
        .expect(401);
    });

    it('creates a city', async () => {
      const country = await prisma.country.create({ data: { code: 'AU', name: 'Australia' } });

      const res = await request(app.getHttpServer())
        .post('/api/city')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Sydney', countryId: country.id })
        .expect(201);

      expect(res.body).toMatchObject({ name: 'Sydney', countryId: country.id });
      expect(res.body).toHaveProperty('id');
    });

    it('returns 400 without countryId', async () => {
      await request(app.getHttpServer())
        .post('/api/city')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Melbourne' })
        .expect(400);
    });
  });
});
