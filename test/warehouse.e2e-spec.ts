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
      const country = await prisma.country.findFirstOrThrow({ where: { code: 'AU' } });
      const locality = await prisma.locality.create({
        data: { name: 'Sydney', countryId: country.id },
      });
      const org = await prisma.organization.create({ data: { name: 'Acme Corp' } });

      const res = await request(app.getHttpServer())
        .post('/api/warehouse')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          code: 'WH-001',
          address: '123 Warehouse St',
          organizationId: org.id,
          localityId: locality.id,
        })
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

  describe('POST /api/warehouse/with-price-list-assignment', () => {
    it('creates the warehouse and assignment atomically', async () => {
      const country = await prisma.country.findFirstOrThrow({ where: { code: 'AU' } });
      const locality = await prisma.locality.create({
        data: { name: 'Melbourne', countryId: country.id },
      });
      const organization = await prisma.organization.create({
        data: { name: 'Atomic warehouse organization' },
      });
      const priceList = await prisma.priceList.create({
        data: { name: 'Warehouse price list', currency: 'RUB' },
      });

      const res = await request(app.getHttpServer())
        .post('/api/warehouse/with-price-list-assignment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          code: 'WH-ATOMIC',
          address: 'Atomic warehouse address',
          organizationId: organization.id,
          localityId: locality.id,
          priceListId: priceList.id,
        })
        .expect(201);

      await expect(
        prisma.priceListAssignment.findUniqueOrThrow({
          where: { warehouseId: res.body.id as number },
        }),
      ).resolves.toMatchObject({
        priceListId: priceList.id,
        targetType: 'WAREHOUSE',
      });
    });

    it('rolls back the warehouse when the price list does not exist', async () => {
      const country = await prisma.country.findFirstOrThrow({ where: { code: 'AU' } });
      const locality = await prisma.locality.create({
        data: { name: 'Brisbane', countryId: country.id },
      });
      const organization = await prisma.organization.create({
        data: { name: 'Rolled back warehouse organization' },
      });

      await request(app.getHttpServer())
        .post('/api/warehouse/with-price-list-assignment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          code: 'WH-ROLLBACK',
          address: 'Rolled back warehouse address',
          organizationId: organization.id,
          localityId: locality.id,
          priceListId: 999999,
        })
        .expect(404);

      await expect(
        prisma.warehouse.findUnique({ where: { code: 'WH-ROLLBACK' } }),
      ).resolves.toBeNull();
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

    it('rolls back the warehouse update when assignment update fails', async () => {
      const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { code: 'WH-ATOMIC' } });
      const assignment = await prisma.priceListAssignment.findUniqueOrThrow({
        where: { warehouseId: warehouse.id },
      });

      await request(app.getHttpServer())
        .patch(`/api/warehouse/${warehouse.id}/with-price-list-assignment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ address: 'Address after failed update', priceListId: 999999 })
        .expect(404);

      await expect(
        prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } }),
      ).resolves.toMatchObject({ address: 'Atomic warehouse address' });
      await expect(
        prisma.priceListAssignment.findUniqueOrThrow({ where: { warehouseId: warehouse.id } }),
      ).resolves.toMatchObject({ priceListId: assignment.priceListId });
    });
  });
});
