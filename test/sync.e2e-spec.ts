import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { cleanDatabase, createApp, seedAdmin } from './helpers';

describe('Sync (e2e)', () => {
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

  describe('GET /api/sync/:table', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/sync/country').expect(401);
    });

    it('returns items for valid table', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sync/country')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('returns empty items for unknown table', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sync/unknown')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toEqual({ items: [] });
    });

    it('handles invalid since without error', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sync/country?since=not-a-date')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
    });

    it('filters by valid since date', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sync/country?since=2099-01-01T00:00:00.000Z')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toEqual({ items: [] });
    });
  });
});
