import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { cleanDatabase, createApp, seedAdmin } from './helpers';

describe('Product item favorites (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let employeeToken: string;
  let firstProductItemId: number;
  let secondProductItemId: number;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);
    ({ access_token: adminToken } = await seedAdmin(app));

    const password = 'Test1234!';
    await prisma.employee.create({
      data: {
        email: 'favorites-user@e2e.test',
        password: await bcrypt.hash(password, 10),
        firstName: 'Favorite',
        lastName: 'User',
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'favorites-user@e2e.test', password })
      .expect(200);
    employeeToken = login.body.access_token as string;

    const productType = await prisma.productType.findFirstOrThrow();
    const productMeasure = await prisma.productMeasure.findUniqueOrThrow({
      where: { code: 'pcs' },
    });
    const products = await Promise.all(
      ['FAVORITE-001', 'FAVORITE-002'].map((sku) =>
        prisma.productItem.create({
          data: {
            sku,
            name: sku,
            productTypeId: productType.id,
            productMeasureId: productMeasure.id,
          },
        }),
      ),
    );
    [firstProductItemId, secondProductItemId] = products.map((product) => product.id);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await prisma.productItemFavorite.deleteMany();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/product-item/favorites').expect(401);
    await request(app.getHttpServer())
      .put(`/api/product-item/${firstProductItemId}/favorite`)
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/api/product-item/${firstProductItemId}/favorite`)
      .expect(401);
  });

  it('adds a favorite idempotently and returns a paginated account snapshot', async () => {
    await request(app.getHttpServer())
      .put(`/api/product-item/${firstProductItemId}/favorite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/product-item/${firstProductItemId}/favorite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/product-item/${secondProductItemId}/favorite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const firstPage = await request(app.getHttpServer())
      .get('/api/product-item/favorites?page=1&limit=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(firstPage.body).toMatchObject({ total: 2, page: 1, limit: 1, pages: 2 });
    expect(firstPage.body.items).toHaveLength(1);
    expect(firstPage.body.items[0]).toEqual({
      productItemId: Math.min(firstProductItemId, secondProductItemId),
      createdAt: expect.any(String),
    });
    expect(await prisma.productItemFavorite.count()).toBe(2);
  });

  it('isolates favorites by authenticated employee', async () => {
    await request(app.getHttpServer())
      .put(`/api/product-item/${firstProductItemId}/favorite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/api/product-item/favorites')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);

    expect(response.body).toMatchObject({ items: [], total: 0, pages: 0 });
  });

  it('removes only the current employee favorite and remains idempotent', async () => {
    await request(app.getHttpServer())
      .put(`/api/product-item/${firstProductItemId}/favorite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/product-item/${firstProductItemId}/favorite`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/product-item/${firstProductItemId}/favorite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/product-item/${firstProductItemId}/favorite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    const employeeFavorites = await request(app.getHttpServer())
      .get('/api/product-item/favorites')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(employeeFavorites.body.items).toEqual([
      expect.objectContaining({ productItemId: firstProductItemId }),
    ]);
  });

  it('returns 404 when adding a missing product item', async () => {
    await request(app.getHttpServer())
      .put('/api/product-item/2147483647/favorite')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
