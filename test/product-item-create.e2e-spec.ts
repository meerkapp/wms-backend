import { ProductItemWithRelationsSchema } from '@meerkapp/wms-contracts';
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { cleanDatabase, createApp, seedAdmin } from './helpers';

describe('Product item creation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let noPermissionToken: string;
  let measureId: number;
  let sequentialTypeId: number;
  let templateTypeId: number;
  let deterministicTypeId: number;
  let manualTypeId: number;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);
    ({ access_token: adminToken } = await seedAdmin(app));

    const measure = await prisma.productMeasure.findFirstOrThrow({
      orderBy: { id: 'asc' },
    });
    measureId = measure.id;

    const scheme = [
      {
        key: 'color',
        label: 'Color',
        type: 'select',
        required: true,
        options: [
          { label: 'Red', value: 'RED' },
          { label: 'Blue', value: 'BLUE' },
        ],
      },
      {
        key: 'size',
        label: 'Size',
        type: 'number',
        required: true,
        validation: { min: 1, max: 100 },
      },
    ] satisfies Prisma.InputJsonValue;

    const [sequentialType, templateType, deterministicType, manualType] = await Promise.all([
      prisma.productType.create({
        data: { name: 'Sequential products', skuMode: 'SEQUENTIAL' },
      }),
      prisma.productType.create({
        data: {
          name: 'Template products',
          skuMode: 'TEMPLATE',
          skuTemplate: 'SHOE-{color:2}-{size}-{seq:6}',
          characteristicsScheme: scheme,
        },
      }),
      prisma.productType.create({
        data: {
          name: 'Deterministic products',
          skuMode: 'TEMPLATE',
          skuTemplate: 'COLOR-{color}',
          characteristicsScheme: scheme,
        },
      }),
      prisma.productType.create({
        data: { name: 'Manual products', skuMode: 'MANUAL' },
      }),
    ]);
    sequentialTypeId = sequentialType.id;
    templateTypeId = templateType.id;
    deterministicTypeId = deterministicType.id;
    manualTypeId = manualType.id;

    const email = 'no-product-create@e2e.test';
    const password = 'Test1234!';
    await prisma.employee.create({
      data: {
        email,
        password: await bcrypt.hash(password, 10),
        firstName: 'No',
        lastName: 'Permission',
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    noPermissionToken = login.body.access_token as string;
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  function productPayload(productTypeId: number, overrides: Record<string, unknown> = {}) {
    return {
      creationRequestId: randomUUID(),
      name: 'Test product',
      productTypeId,
      productMeasureId: measureId,
      characteristics: {},
      ...overrides,
    };
  }

  it('requires authentication and product_item:create permission', async () => {
    const payload = productPayload(sequentialTypeId);
    await request(app.getHttpServer()).post('/api/product-item').send(payload).expect(401);
    await request(app.getHttpServer())
      .post('/api/product-item')
      .set('Authorization', `Bearer ${noPermissionToken}`)
      .send(payload)
      .expect(403);
  });

  it('creates an item with a global sequential SKU and a base package', async () => {
    const creationRequestId = randomUUID();
    const response = await request(app.getHttpServer())
      .post('/api/product-item')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload(sequentialTypeId, { creationRequestId }))
      .expect(201);

    expect(response.body).toMatchObject({
      name: 'Test product',
      productTypeId: sequentialTypeId,
      productMeasureId: measureId,
    });
    expect(response.body).not.toHaveProperty('creationRequestId');
    expect(response.body.sku).toMatch(/^\d{8,}$/);
    expect(() => ProductItemWithRelationsSchema.parse(response.body)).not.toThrow();

    const packages = await prisma.productPackage.findMany({
      where: { productItemId: response.body.id as number },
    });
    expect(packages).toHaveLength(1);
    expect(packages[0]).toMatchObject({ isBase: true });
    expect(packages[0]?.conversionFactor.toString()).toBe('1');

    const synced = await request(app.getHttpServer())
      .get(`/api/sync/fetch/product-items?id=${response.body.id as number}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(synced.body.items[0]).not.toHaveProperty('creationRequestId');
  });

  it('returns the original item when the same creation request is retried', async () => {
    const creationRequestId = randomUUID();
    const payload = productPayload(sequentialTypeId, { creationRequestId });

    const first = await request(app.getHttpServer())
      .post('/api/product-item')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);
    const retry = await request(app.getHttpServer())
      .post('/api/product-item')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...payload, name: 'Changed retry payload' })
      .expect(201);

    expect(retry.body.id).toBe(first.body.id);
    expect(retry.body.sku).toBe(first.body.sku);
    expect(retry.body.name).toBe('Test product');
    expect(await prisma.productItem.count({ where: { creationRequestId } })).toBe(1);
  });

  it('deduplicates concurrent requests with the same creation request id', async () => {
    const creationRequestId = randomUUID();
    const payload = productPayload(sequentialTypeId, { creationRequestId });

    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(app.getHttpServer())
          .post('/api/product-item')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(payload)
          .expect(201),
      ),
    );

    expect(new Set(responses.map((response) => response.body.id as number)).size).toBe(1);
    expect(await prisma.productItem.count({ where: { creationRequestId } })).toBe(1);
  });

  it('generates unique SKUs for concurrent sequential creations', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        request(app.getHttpServer())
          .post('/api/product-item')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(
            productPayload(sequentialTypeId, {
              name: `Concurrent product ${index}`,
            }),
          )
          .expect(201),
      ),
    );

    const skus = responses.map((response) => response.body.sku as string);
    expect(new Set(skus).size).toBe(skus.length);
  });

  it('renders a template from validated characteristics without a brand token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/product-item')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        productPayload(templateTypeId, {
          characteristics: { color: 'RED', size: 42 },
        }),
      )
      .expect(201);

    expect(response.body.sku).toMatch(/^SHOE-RE-42-\d{6,}$/);
  });

  it('normalizes manually entered SKUs and rejects them in automatic modes', async () => {
    const manual = await request(app.getHttpServer())
      .post('/api/product-item')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload(manualTypeId, { sku: ' legacy.manual-1 ' }))
      .expect(201);
    expect(manual.body.sku).toBe('LEGACY.MANUAL-1');

    await request(app.getHttpServer())
      .post('/api/product-item')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload(manualTypeId))
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/product-item')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload(sequentialTypeId, { sku: 'OVERRIDE-1' }))
      .expect(400);
  });

  it('rejects missing, invalid and unknown characteristics', async () => {
    await request(app.getHttpServer())
      .post('/api/product-item')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload(templateTypeId, { characteristics: { color: 'RED' } }))
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/product-item')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        productPayload(templateTypeId, {
          characteristics: { color: 'GREEN', size: 42 },
        }),
      )
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/product-item')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        productPayload(templateTypeId, {
          characteristics: { color: 'RED', size: 42, unknown: true },
        }),
      )
      .expect(400);
  });

  it('returns 409 instead of inventing suffixes for deterministic SKU collisions', async () => {
    const characteristics = { color: 'BLUE', size: 42 };
    await request(app.getHttpServer())
      .post('/api/product-item')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload(deterministicTypeId, { characteristics }))
      .expect(201);

    const conflict = await request(app.getHttpServer())
      .post('/api/product-item')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload(deterministicTypeId, { characteristics }))
      .expect(409);
    expect(conflict.body.message).toBe('SKU COLOR-BLUE exists');
  });
});
