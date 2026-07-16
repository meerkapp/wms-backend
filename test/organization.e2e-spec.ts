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

  describe('POST /api/organization/with-price-list-assignment', () => {
    it('creates the organization and assignment atomically', async () => {
      const priceList = await prisma.priceList.create({
        data: { name: 'Organization price list', currency: 'RUB' },
      });

      const res = await request(app.getHttpServer())
        .post('/api/organization/with-price-list-assignment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Atomic organization', priceListId: priceList.id })
        .expect(201);

      await expect(
        prisma.priceListAssignment.findUniqueOrThrow({
          where: { organizationId: res.body.id as number },
        }),
      ).resolves.toMatchObject({
        priceListId: priceList.id,
        targetType: 'ORGANIZATION',
      });
    });

    it('rolls back the organization when the price list does not exist', async () => {
      await request(app.getHttpServer())
        .post('/api/organization/with-price-list-assignment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Rolled back organization', priceListId: 999999 })
        .expect(404);

      await expect(
        prisma.organization.findFirst({ where: { name: 'Rolled back organization' } }),
      ).resolves.toBeNull();
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

    it('rolls back the organization update when assignment update fails', async () => {
      const priceList = await prisma.priceList.create({
        data: { name: 'Existing organization price list', currency: 'RUB' },
      });
      const organization = await prisma.organization.create({
        data: { name: 'Organization before failed update' },
      });
      await prisma.priceListAssignment.create({
        data: {
          priceListId: priceList.id,
          targetType: 'ORGANIZATION',
          organizationId: organization.id,
        },
      });

      await request(app.getHttpServer())
        .patch(`/api/organization/${organization.id}/with-price-list-assignment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Organization after failed update', priceListId: 999999 })
        .expect(404);

      await expect(
        prisma.organization.findUniqueOrThrow({ where: { id: organization.id } }),
      ).resolves.toMatchObject({ name: 'Organization before failed update' });
      await expect(
        prisma.priceListAssignment.findUniqueOrThrow({
          where: { organizationId: organization.id },
        }),
      ).resolves.toMatchObject({ priceListId: priceList.id });
    });
  });
});
