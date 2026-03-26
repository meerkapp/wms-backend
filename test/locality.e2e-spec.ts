import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { cleanDatabase, createApp, seedAdmin } from './helpers';

describe('Locality (e2e)', () => {
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

  describe('POST /api/locality', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/api/locality')
        .send({ name: 'Sydney', countryId: 1 })
        .expect(401);
    });

    it('creates a locality', async () => {
      const country = await prisma.country.findFirstOrThrow({ where: { code: 'AU' } });

      const res = await request(app.getHttpServer())
        .post('/api/locality')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Sydney', countryId: country.id })
        .expect(201);

      expect(res.body).toMatchObject({ name: 'Sydney', countryId: country.id });
      expect(res.body).toHaveProperty('id');
    });

    it('returns 400 without countryId', async () => {
      await request(app.getHttpServer())
        .post('/api/locality')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Melbourne' })
        .expect(400);
    });
  });
});
