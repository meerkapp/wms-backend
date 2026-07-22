import { INestApplication } from '@nestjs/common';
import {
  ProductItemStatsFetchResponseSchema,
  ProductItemWithRelationsSchema,
  ProductPackageSchema,
} from '@meerkapp/wms-contracts';
import * as request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { parseSyncCursor } from '../src/modules/sync/sync-cursor';
import { SYNC_TABLE_NAMES } from '../src/modules/sync/sync.registry';
import { ADMIN, cleanDatabase, createApp, seedAdmin } from './helpers';

describe('Sync (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let homeOrganizationId: number;
  let otherOrganizationId: number;
  let homeWarehouseId: number;
  let otherWarehouseId: number;
  let otherProductShipmentId: number;
  let otherProductItemStatsId: number;
  let readPolicyProductCollectionId: number;
  let productMeasureId: number;
  let baseProductPackageId: number;
  let readPolicyProductItemId: number;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);
    ({ access_token: accessToken } = await seedAdmin(app));
    productMeasureId = (await prisma.productMeasure.findUniqueOrThrow({ where: { code: 'pcs' } }))
      .id;

    const suffix = Date.now();
    const country = await prisma.country.findFirstOrThrow({ where: { code: 'AU' } });
    const locality = await prisma.locality.create({
      data: { name: `Global Sync Locality ${suffix}`, countryId: country.id },
    });
    const homeOrganization = await prisma.organization.create({
      data: { name: `Global Sync Organization A ${suffix}` },
    });
    const otherOrganization = await prisma.organization.create({
      data: { name: `Global Sync Organization B ${suffix}` },
    });
    const homeWarehouse = await prisma.warehouse.create({
      data: {
        address: `Global Sync Warehouse A ${suffix}`,
        code: `GLOBAL-A-${suffix}`,
        localityId: locality.id,
        organizationId: homeOrganization.id,
      },
    });
    const otherWarehouse = await prisma.warehouse.create({
      data: {
        address: `Global Sync Warehouse B ${suffix}`,
        code: `GLOBAL-B-${suffix}`,
        localityId: locality.id,
        organizationId: otherOrganization.id,
      },
    });
    const productType = await prisma.productType.create({
      data: { name: `Global Sync Product Type ${suffix}` },
    });
    const productCollection = await prisma.productCollection.create({
      data: { name: `Global Sync Product Collection ${suffix}` },
    });
    const productItem = await prisma.productItem.create({
      data: {
        sku: `GLOBAL-SYNC-${suffix}`,
        name: `Global Sync Product ${suffix}`,
        productTypeId: productType.id,
        productCollectionId: productCollection.id,
        productMeasureId,
      },
    });
    const baseProductPackage = await prisma.productPackage.create({
      data: { isBase: true, productItemId: productItem.id },
    });
    const shipment = await prisma.productShipment.create({
      data: {
        warehouseId: otherWarehouse.id,
        productItemId: productItem.id,
        arrivalDate: new Date(),
        quantity: '7.000',
      },
    });
    const stats = await prisma.productItemStats.findUniqueOrThrow({
      where: {
        productItemId_warehouseId: {
          productItemId: productItem.id,
          warehouseId: otherWarehouse.id,
        },
      },
    });

    await prisma.employee.update({
      where: { email: ADMIN.email },
      data: { warehouseId: homeWarehouse.id },
    });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ADMIN.email, password: ADMIN.password })
      .expect(200);

    accessToken = login.body.access_token as string;
    homeOrganizationId = homeOrganization.id;
    otherOrganizationId = otherOrganization.id;
    homeWarehouseId = homeWarehouse.id;
    otherWarehouseId = otherWarehouse.id;
    otherProductShipmentId = shipment.id;
    otherProductItemStatsId = stats.id;
    readPolicyProductCollectionId = productCollection.id;
    baseProductPackageId = baseProductPackage.id;
    readPolicyProductItemId = productItem.id;
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  describe('GET /api/sync/pull', () => {
    it('returns 401 without token', async () => {
      await request(app.getHttpServer()).get('/api/sync/pull?table=country').expect(401);
    });

    it('returns items for valid table', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sync/pull?table=country')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('cursor');
      expect(res.body).toHaveProperty('hasMore');
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it.each(SYNC_TABLE_NAMES)('supports the registered %s table contract', async (table) => {
      const res = await request(app.getHttpServer())
        .get(`/api/sync/pull?table=${table}&limit=2`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body).toEqual(
        expect.objectContaining({
          hasMore: expect.any(Boolean),
        }),
      );
      expect(res.body).toHaveProperty('cursor');
    });

    it('serializes package conversion factors as exact decimal strings', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sync/pull?table=product_package')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const productPackage = res.body.items.find(
        (item: { id: number }) => item.id === baseProductPackageId,
      );

      expect(productPackage).toMatchObject({
        productItemId: readPolicyProductItemId,
        conversionFactor: '1',
      });
      expect(() => ProductPackageSchema.parse(productPackage)).not.toThrow();
    });

    it('enforces package conversion constraints in the database', async () => {
      await expect(
        prisma.productPackage.create({
          data: {
            name: 'Invalid zero factor',
            productItemId: readPolicyProductItemId,
            conversionFactor: 0,
          },
        }),
      ).rejects.toThrow();

      await expect(
        prisma.productPackage.update({
          where: { id: baseProductPackageId },
          data: { conversionFactor: 2 },
        }),
      ).rejects.toThrow();
    });

    it('rejects unknown table', async () => {
      await request(app.getHttpServer())
        .get('/api/sync/pull?table=unknown')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('rejects an invalid cursor', async () => {
      await request(app.getHttpServer())
        .get('/api/sync/pull?table=country&since=not-a-date')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('filters by valid since date', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sync/pull?table=country&since=2099-01-01T00:00:00.000Z')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.cursor).toEqual(expect.any(String));
      expect(res.body.cursor).not.toContain('2099-01-01');
      expect(parseSyncCursor(res.body.cursor)).toEqual({
        updatedAt: new Date('2099-01-01T00:00:00.000Z'),
        id: 0,
      });
      expect(res.body.hasMore).toBe(false);
    });

    it('does not skip rows sharing updatedAt across page boundaries', async () => {
      const suffix = Date.now();
      const updatedAt = new Date(Date.now() + 1000);
      const names = [0, 1, 2].map((index) => `Cursor Product Type ${suffix}-${index}`);
      await prisma.productType.createMany({
        data: names.map((name) => ({ name, updatedAt })),
      });
      const expectedIds = (
        await prisma.productType.findMany({
          where: { name: { in: names } },
          select: { id: true },
        })
      ).map((item) => item.id);

      let cursor = new Date(updatedAt.getTime() - 1).toISOString();
      const receivedIds: number[] = [];
      for (let page = 0; page < 4; page += 1) {
        const res = await request(app.getHttpServer())
          .get(`/api/sync/pull?table=product_type&limit=1&since=${encodeURIComponent(cursor)}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        receivedIds.push(...res.body.items.map((item: { id: number }) => item.id));
        cursor = res.body.cursor as string;
        if (!res.body.hasMore) break;
      }

      expect(receivedIds).toEqual(expectedIds.sort((left, right) => left - right));
    });

    it('returns all organizations regardless of the user warehouse organization', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sync/pull?table=organization')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const ids = res.body.items.map((item: { id: number }) => item.id);
      expect(ids).toEqual(expect.arrayContaining([homeOrganizationId, otherOrganizationId]));
    });

    it('returns warehouses from other organizations', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sync/pull?table=warehouse')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const ids = res.body.items.map((item: { id: number }) => item.id);
      expect(ids).toEqual(expect.arrayContaining([homeWarehouseId, otherWarehouseId]));
    });

    it('returns product shipments from another warehouse', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sync/pull?table=product_shipment')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items).toEqual([
        expect.objectContaining({ id: otherProductShipmentId, warehouseId: otherWarehouseId }),
      ]);
    });

    it('returns product item stats from another warehouse', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sync/pull?table=product_item_stats')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items).toEqual([
        expect.objectContaining({ id: otherProductItemStatsId, warehouseId: otherWarehouseId }),
      ]);
    });
  });

  describe('typed lazy fetch endpoints', () => {
    let productTypeId: number;
    let productCollectionId: number;
    let rootProductItemId: number;
    let collectionProductItemId: number;
    let productBarcodeCode: string;
    let warehouseId: number;

    beforeAll(async () => {
      const suffix = Date.now();
      const country = await prisma.country.findFirstOrThrow({ where: { code: 'AU' } });
      const locality = await prisma.locality.create({
        data: { name: `Sync Sydney ${suffix}`, countryId: country.id },
      });
      const organization = await prisma.organization.create({
        data: { name: `Sync Org ${suffix}` },
      });
      const warehouse = await prisma.warehouse.create({
        data: {
          address: `Sync Warehouse ${suffix}`,
          code: `SYNC-${suffix}`,
          localityId: locality.id,
          organizationId: organization.id,
        },
      });
      const productType = await prisma.productType.create({
        data: { name: `Sync Product Type ${suffix}` },
      });
      const productCollection = await prisma.productCollection.create({
        data: { name: `Sync Product Collection ${suffix}` },
      });
      const rootProductItem = await prisma.productItem.create({
        data: {
          sku: `SYNC-ROOT-${suffix}`,
          name: `Sync Root Product ${suffix}`,
          productTypeId: productType.id,
          productMeasureId,
        },
      });
      const collectionProductItem = await prisma.productItem.create({
        data: {
          sku: `SYNC-COLLECTION-${suffix}`,
          name: `Sync Collection Product ${suffix}`,
          productTypeId: productType.id,
          productCollectionId: productCollection.id,
          productMeasureId,
        },
      });
      const productBarcode = await prisma.productBarcode.create({
        data: {
          code: `460${suffix}`,
          productItemId: collectionProductItem.id,
        },
      });

      await prisma.productShipment.create({
        data: {
          warehouseId: warehouse.id,
          productItemId: collectionProductItem.id,
          arrivalDate: new Date(),
          quantity: '3.000',
        },
      });
      await prisma.productShipment.create({
        data: {
          warehouseId: warehouse.id,
          productItemId: rootProductItem.id,
          arrivalDate: new Date(),
          quantity: '1.000',
        },
      });

      productTypeId = productType.id;
      productCollectionId = productCollection.id;
      rootProductItemId = rootProductItem.id;
      collectionProductItemId = collectionProductItem.id;
      productBarcodeCode = productBarcode.code;
      warehouseId = warehouse.id;
    });

    it('returns 401 without token', async () => {
      await request(app.getHttpServer())
        .get(`/api/sync/fetch/product-items?id=${collectionProductItemId}`)
        .expect(401);
    });

    it('fetches product item by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/sync/fetch/product-items?id=${collectionProductItemId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({
        id: collectionProductItemId,
        productTypeId,
        productMeasure: { code: 'pcs' },
      });
      expect(() => ProductItemWithRelationsSchema.parse(res.body.items[0])).not.toThrow();
      expect(res.body).toHaveProperty('cursor');
      expect(res.body.hasMore).toBe(false);
    });

    it('fetches product items by collection', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/sync/fetch/product-items?productCollectionId=${productCollectionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items.map((item: { id: number }) => item.id)).toContain(
        collectionProductItemId,
      );
      expect(res.body.items.map((item: { id: number }) => item.id)).not.toContain(
        rootProductItemId,
      );
    });

    it('fetches root product items with productCollectionId=null', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sync/fetch/product-items?productCollectionId=null')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items.map((item: { id: number }) => item.id)).toContain(rootProductItemId);
    });

    it('rejects product item fetch without an explicit filter', async () => {
      await request(app.getHttpServer())
        .get('/api/sync/fetch/product-items')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('fetches product barcode by code', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/sync/fetch/product-barcodes?code=${productBarcodeCode}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({
        code: productBarcodeCode,
        productItemId: collectionProductItemId,
      });
    });

    it('fetches product barcodes by product item id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/sync/fetch/product-barcodes?productItemId=${collectionProductItemId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items).toEqual([
        expect.objectContaining({
          code: productBarcodeCode,
          productItemId: collectionProductItemId,
        }),
      ]);
      expect(res.body).toEqual(
        expect.objectContaining({
          cursor: expect.any(String),
          hasMore: false,
        }),
      );
    });

    it('fetches product shipments by warehouse', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/sync/fetch/product-shipments?warehouseId=${warehouseId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items.map((item: { productItemId: number }) => item.productItemId)).toContain(
        collectionProductItemId,
      );
    });

    it('fetches product item stats by collection and warehouse', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/sync/fetch/product-item-stats?productCollectionId=${productCollectionId}&warehouseId=${warehouseId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items.map((item: { productItemId: number }) => item.productItemId)).toContain(
        collectionProductItemId,
      );
    });

    it('fetches all product item stats for a warehouse without a collection filter', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/sync/fetch/product-item-stats?warehouseId=${warehouseId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(() => ProductItemStatsFetchResponseSchema.parse(res.body)).not.toThrow();

      expect(res.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            productItemId: collectionProductItemId,
            warehouseId,
          }),
        ]),
      );
      expect(res.body).toEqual(
        expect.objectContaining({
          cursor: expect.any(String),
          hasMore: expect.any(Boolean),
        }),
      );
    });

    it('returns 401 for warehouse stats without a token', async () => {
      await request(app.getHttpServer())
        .get(`/api/sync/fetch/product-item-stats?warehouseId=${warehouseId}`)
        .expect(401);
    });

    it('reports hasMore when a warehouse contains more stats than the requested limit', async () => {
      const firstPage = await request(app.getHttpServer())
        .get(`/api/sync/fetch/product-item-stats?warehouseId=${warehouseId}&limit=1`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(() => ProductItemStatsFetchResponseSchema.parse(firstPage.body)).not.toThrow();

      expect(firstPage.body.items).toHaveLength(1);
      expect(firstPage.body).toEqual(
        expect.objectContaining({
          cursor: expect.any(String),
          hasMore: true,
        }),
      );

      const secondPage = await request(app.getHttpServer())
        .get(
          `/api/sync/fetch/product-item-stats?warehouseId=${warehouseId}&limit=1&cursor=${encodeURIComponent(firstPage.body.cursor)}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(() => ProductItemStatsFetchResponseSchema.parse(secondPage.body)).not.toThrow();
      expect(secondPage.body.items).toHaveLength(1);
      expect(secondPage.body.items[0].id).not.toBe(firstPage.body.items[0].id);
      expect(secondPage.body.hasMore).toBe(false);
    });

    it('fetches shipments from another warehouse', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/sync/fetch/product-shipments?warehouseId=${otherWarehouseId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items).toEqual([
        expect.objectContaining({ id: otherProductShipmentId, warehouseId: otherWarehouseId }),
      ]);
    });

    it('fetches product item stats from another warehouse', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/sync/fetch/product-item-stats?warehouseId=${otherWarehouseId}&productCollectionId=${readPolicyProductCollectionId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items).toEqual([
        expect.objectContaining({ id: otherProductItemStatsId, warehouseId: otherWarehouseId }),
      ]);
    });

    it('keeps the legacy typed stats read endpoint global across warehouses', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/product-item/stats?warehouseId=${otherWarehouseId}&productCollectionId=${readPolicyProductCollectionId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toEqual([
        expect.objectContaining({ id: otherProductItemStatsId, warehouseId: otherWarehouseId }),
      ]);
    });

    it.each([
      '/api/sync/fetch/product-items?id=invalid',
      '/api/sync/fetch/product-items?productCollectionId=0',
      '/api/sync/fetch/product-items?id=1&productCollectionId=1',
      '/api/sync/fetch/product-barcodes?productItemId=invalid',
      '/api/sync/fetch/product-shipments',
      '/api/sync/fetch/product-item-stats',
      '/api/sync/fetch/product-item-stats?warehouseId=invalid',
      '/api/sync/fetch/product-item-stats?warehouseId=1&productCollectionId=0',
      '/api/sync/fetch/product-item-stats?warehouseId=1&cursor=invalid',
      '/api/sync/fetch/product-item-stats?warehouseId=1&limit=invalid',
      '/api/sync/fetch/product-item-stats?warehouseId=1&limit=0',
      '/api/sync/fetch/product-items?id=1&limit=0',
    ])('rejects invalid typed query params: %s', async (url) => {
      await request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('caps an oversized limit and preserves the typed response contract', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/sync/fetch/product-items?productCollectionId=${productCollectionId}&limit=5001`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items.length).toBeLessThanOrEqual(5000);
      expect(res.body).toEqual(
        expect.objectContaining({
          cursor: expect.any(String),
          hasMore: expect.any(Boolean),
        }),
      );
    });

    it('caps an oversized warehouse stats limit and preserves the response contract', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/sync/fetch/product-item-stats?warehouseId=${warehouseId}&limit=5001`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items.length).toBeLessThanOrEqual(5000);
      expect(res.body).toEqual(
        expect.objectContaining({
          cursor: expect.any(String),
          hasMore: expect.any(Boolean),
        }),
      );
    });

    it('returns 404 for the removed generic POST /sync/fetch endpoint', async () => {
      await request(app.getHttpServer())
        .post('/api/sync/fetch?model=product_item')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ id: collectionProductItemId })
        .expect(404);
    });
  });
});
