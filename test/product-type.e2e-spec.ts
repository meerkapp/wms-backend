import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { cleanDatabase, createApp, seedAdmin } from './helpers';

const SEQUENTIAL_TYPE = {
  name: 'Electronics',
  skuMode: 'SEQUENTIAL',
};

const TEMPLATE_TYPE = {
  name: 'Clothing',
  skuMode: 'TEMPLATE',
  skuTemplate: '{color}-{seq:6}',
  characteristicsScheme: [
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
      type: 'select',
      required: false,
      options: [
        { label: 'S', value: 'S' },
        { label: 'M', value: 'M' },
        { label: 'L', value: 'L' },
      ],
    },
  ],
};

describe('ProductType (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let noPermToken: string;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);
    ({ access_token: adminToken } = await seedAdmin(app));

    const email = 'noperm-pt@e2e.test';
    const password = 'Test1234!';
    await prisma.employee.create({
      data: {
        email,
        password: await bcrypt.hash(password, 10),
        firstName: 'No',
        lastName: 'Perm',
      },
    });
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });
    noPermToken = res.body.access_token as string;
  });

  afterAll(async () => {
    await prisma.productType.deleteMany();
    await cleanDatabase(prisma);
    await app.close();
  });

  // ---------------------------------------------------------------------------
  describe('GET /api/product-type', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/product-type').expect(401);
    });

    it('returns empty array when no types exist', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/product-type')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /api/product-type', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/api/product-type')
        .send(SEQUENTIAL_TYPE)
        .expect(401);
    });

    it('returns 403 without product_type:create permission', async () => {
      await request(app.getHttpServer())
        .post('/api/product-type')
        .set('Authorization', `Bearer ${noPermToken}`)
        .send({ name: 'Blocked', skuMode: 'SEQUENTIAL' })
        .expect(403);
    });

    it('creates a SEQUENTIAL product type', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/product-type')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(SEQUENTIAL_TYPE)
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'Electronics',
        skuMode: 'SEQUENTIAL',
        skuTemplate: null,
        defaultWriteoffStrategy: 'FIFO',
        characteristicsScheme: null,
      });
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('updatedAt');
    });

    it('creates a TEMPLATE product type with characteristicsScheme', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/product-type')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(TEMPLATE_TYPE)
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'Clothing',
        skuMode: 'TEMPLATE',
        skuTemplate: '{color}-{seq:6}',
      });
      expect(res.body.characteristicsScheme).toHaveLength(2);
    });

    it('creates a MANUAL product type without a template', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/product-type')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Legacy imports', skuMode: 'MANUAL' })
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'Legacy imports',
        skuMode: 'MANUAL',
        skuTemplate: null,
      });
    });

    it('returns 400 for missing name', async () => {
      await request(app.getHttpServer())
        .post('/api/product-type')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });

    it('returns 400 for TEMPLATE mode without skuTemplate', async () => {
      await request(app.getHttpServer())
        .post('/api/product-type')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bad Template', skuMode: 'TEMPLATE' })
        .expect(400);
    });

    it('returns 400 when skuTemplate references non-required characteristic key', async () => {
      await request(app.getHttpServer())
        .post('/api/product-type')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Bad Keys',
          skuMode: 'TEMPLATE',
          skuTemplate: '{unknown_key}',
          characteristicsScheme: [
            {
              key: 'color',
              label: 'Color',
              type: 'select',
              required: false,
              options: [{ label: 'Red', value: 'RED' }],
            },
          ],
        })
        .expect(400);
    });

    it('returns 400 for removed brand tokens and templates in non-template modes', async () => {
      await request(app.getHttpServer())
        .post('/api/product-type')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Brand template',
          skuMode: 'TEMPLATE',
          skuTemplate: '{brand}-{seq}',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/product-type')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Unexpected template',
          skuMode: 'SEQUENTIAL',
          skuTemplate: 'SKU-{seq}',
        })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /api/product-type/:id', () => {
    let typeId: number;

    beforeAll(async () => {
      const type = await prisma.productType.findFirst({ where: { name: 'Electronics' } });
      typeId = type!.id;
    });

    it('returns 401 without token', async () => {
      await request(app.getHttpServer()).get(`/api/product-type/${typeId}`).expect(401);
    });

    it('returns product type by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/product-type/${typeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toMatchObject({ id: typeId, name: 'Electronics' });
    });

    it('returns 404 for non-existent id', async () => {
      await request(app.getHttpServer())
        .get('/api/product-type/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('PATCH /api/product-type/:id', () => {
    let typeId: number;

    beforeAll(async () => {
      const type = await prisma.productType.findFirst({ where: { name: 'Electronics' } });
      typeId = type!.id;
    });

    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .patch(`/api/product-type/${typeId}`)
        .send({ name: 'Updated' })
        .expect(401);
    });

    it('returns 403 without product_type:update permission', async () => {
      await request(app.getHttpServer())
        .patch(`/api/product-type/${typeId}`)
        .set('Authorization', `Bearer ${noPermToken}`)
        .send({ name: 'Blocked' })
        .expect(403);
    });

    it('updates name', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/product-type/${typeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Electronics' })
        .expect(200);

      expect(res.body).toMatchObject({ id: typeId, name: 'Updated Electronics' });
    });

    it('updates defaultWriteoffStrategy', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/product-type/${typeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ defaultWriteoffStrategy: 'LIFO' })
        .expect(200);

      expect(res.body.defaultWriteoffStrategy).toBe('LIFO');
    });

    it('adds characteristicsScheme to an existing type', async () => {
      const scheme = [
        {
          key: 'voltage',
          label: 'Voltage',
          type: 'number',
          required: false,
          validation: { min: 0, max: 1000 },
          ui: { suffix: 'V' },
        },
      ];

      const res = await request(app.getHttpServer())
        .patch(`/api/product-type/${typeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ characteristicsScheme: scheme })
        .expect(200);

      expect(res.body.characteristicsScheme).toHaveLength(1);
      expect(res.body.characteristicsScheme[0]).toMatchObject({ key: 'voltage' });
    });

    it('returns 400 when switching to TEMPLATE without a skuTemplate', async () => {
      await request(app.getHttpServer())
        .patch(`/api/product-type/${typeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ skuMode: 'TEMPLATE' })
        .expect(400);
    });

    it('validates an existing template when characteristics are patched', async () => {
      const templateType = await prisma.productType.findFirstOrThrow({
        where: { name: 'Clothing' },
      });

      await request(app.getHttpServer())
        .patch(`/api/product-type/${templateType.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          characteristicsScheme: [
            {
              key: 'color',
              label: 'Color',
              type: 'select',
              required: false,
              options: [{ label: 'Red', value: 'RED' }],
            },
          ],
        })
        .expect(400);
    });

    it('clears an old template when switching to a non-template mode', async () => {
      const templateType = await prisma.productType.findFirstOrThrow({
        where: { name: 'Clothing' },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/product-type/${templateType.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ skuMode: 'SEQUENTIAL' })
        .expect(200);

      expect(res.body).toMatchObject({
        skuMode: 'SEQUENTIAL',
        skuTemplate: null,
      });
    });

    it('returns 404 for non-existent id', async () => {
      await request(app.getHttpServer())
        .patch('/api/product-type/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Ghost' })
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /api/product-type returns sorted list', () => {
    it('returns all types sorted by name', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/product-type')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(2);
      const names = res.body.map((t: { name: string }) => t.name) as string[];
      expect(names).toEqual([...names].sort());
    });
  });
});
