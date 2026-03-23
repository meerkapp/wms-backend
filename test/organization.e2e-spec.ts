import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { cleanDatabase, createApp, seedAdmin } from './helpers';

describe('Organization (e2e)', () => {
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

  describe('POST /api/organization', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/api/organization')
        .send({ name: 'Acme Corp' })
        .expect(401);
    });

    it('creates an organization', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/organization')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Acme Corp' })
        .expect(201);

      expect(res.body).toMatchObject({ name: 'Acme Corp' });
      expect(res.body).toHaveProperty('id');
    });
  });

  describe('PATCH /api/organization/:id', () => {
    it('updates an organization', async () => {
      const org = await prisma.organization.create({ data: { name: 'Old Name' } });

      const res = await request(app.getHttpServer())
        .patch(`/api/organization/${org.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'New Name' })
        .expect(200);

      expect(res.body).toMatchObject({ name: 'New Name' });
    });

    it('returns 404 for non-existent organization', async () => {
      await request(app.getHttpServer())
        .patch('/api/organization/999999')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Ghost' })
        .expect(404);
    });
  });
});
