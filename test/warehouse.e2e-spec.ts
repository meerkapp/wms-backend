import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { cleanDatabase, createApp, seedAdmin } from './helpers';

describe('Warehouse (e2e)', () => {
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

  describe('POST /api/warehouse', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/api/warehouse')
        .send({ code: 'WH-001', address: '123 Warehouse St', organizationId: 1, localityId: 1 })
        .expect(401);
    });

    it('creates a warehouse', async () => {
      const country = await prisma.country.create({ data: { code: 'AU', name: 'Australia' } });
      const locality = await prisma.locality.create({ data: { name: 'Sydney', countryId: country.id } });
      const org = await prisma.organization.create({ data: { name: 'Acme Corp' } });

      const res = await request(app.getHttpServer())
        .post('/api/warehouse')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: 'WH-001', address: '123 Warehouse St', organizationId: org.id, localityId: locality.id })
        .expect(201);

      expect(res.body).toMatchObject({ code: 'WH-001', address: '123 Warehouse St' });
      expect(res.body).toHaveProperty('id');
    });

    it('returns 400 without required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/warehouse')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: 'WH-002', address: '456 St' })
        .expect(400);
    });
  });

  describe('PATCH /api/warehouse/:id', () => {
    it('updates a warehouse', async () => {
      const warehouse = await prisma.warehouse.findFirst({ where: { code: 'WH-001' } });

      const res = await request(app.getHttpServer())
        .patch(`/api/warehouse/${warehouse!.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ note: 'Main warehouse' })
        .expect(200);

      expect(res.body).toMatchObject({ note: 'Main warehouse' });
    });

    it('returns 404 for non-existent warehouse', async () => {
      await request(app.getHttpServer())
        .patch('/api/warehouse/999999')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ note: 'Ghost' })
        .expect(404);
    });
  });
});
