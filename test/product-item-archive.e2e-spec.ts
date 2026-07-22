import { INestApplication } from '@nestjs/common';
import { ProductItemWithRelationsSchema } from '@meerkapp/wms-contracts';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { cleanDatabase, createApp, seedAdmin } from './helpers';

describe('Product item archive (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let employeeToken: string;
  let adminId: string;
  let zeroStockProductId: number;
  let stockedProductId: number;
  let zeroStockBarcodeId: number;
  let zeroStockPackageId: number;
  let zeroStockShipmentId: number;
  let zeroStockStatsId: number;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);
    ({ access_token: adminToken } = await seedAdmin(app));
    adminId = (await prisma.employee.findUniqueOrThrow({ where: { email: 'admin@test.com' } })).id;

    const password = 'Test1234!';
    await prisma.employee.create({
      data: {
        email: 'archive-user@e2e.test',
        password: await bcrypt.hash(password, 10),
        firstName: 'Archive',
        lastName: 'User',
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'archive-user@e2e.test', password })
      .expect(200);
    employeeToken = login.body.access_token as string;

    const suffix = Date.now();
    const country = await prisma.country.findFirstOrThrow({ where: { code: 'AU' } });
    const locality = await prisma.locality.create({
      data: { name: `Archive locality ${suffix}`, countryId: country.id },
    });
    const organization = await prisma.organization.create({
      data: { name: `Archive organization ${suffix}` },
    });
    const warehouse = await prisma.warehouse.create({
      data: {
        address: `Archive warehouse ${suffix}`,
        code: `ARCHIVE-${suffix}`,
        localityId: locality.id,
        organizationId: organization.id,
      },
    });
    const productType = await prisma.productType.findFirstOrThrow();
    const productMeasure = await prisma.productMeasure.findUniqueOrThrow({
      where: { code: 'pcs' },
    });
    const [zeroStockProduct, stockedProduct] = await Promise.all(
      ['ZERO', 'STOCKED'].map((label) =>
        prisma.productItem.create({
          data: {
            sku: `ARCHIVE-${label}-${suffix}`,
            name: `Archive ${label}`,
            productTypeId: productType.id,
            productMeasureId: productMeasure.id,
          },
        }),
      ),
    );
    zeroStockProductId = zeroStockProduct.id;
    stockedProductId = stockedProduct.id;

    const zeroStockBarcode = await prisma.productBarcode.create({
      data: { code: `ARCHIVE-BARCODE-${suffix}`, productItemId: zeroStockProduct.id },
    });
    const zeroStockPackage = await prisma.productPackage.create({
      data: { isBase: true, productItemId: zeroStockProduct.id },
    });
    const zeroStockShipment = await prisma.productShipment.create({
      data: {
        warehouseId: warehouse.id,
        productItemId: zeroStockProduct.id,
        arrivalDate: new Date(),
        quantity: '0',
      },
    });
    const zeroStockStats = await prisma.productItemStats.findUniqueOrThrow({
      where: {
        productItemId_warehouseId: {
          productItemId: zeroStockProduct.id,
          warehouseId: warehouse.id,
        },
      },
    });
    zeroStockBarcodeId = zeroStockBarcode.id;
    zeroStockPackageId = zeroStockPackage.id;
    zeroStockShipmentId = zeroStockShipment.id;
    zeroStockStatsId = zeroStockStats.id;

    await prisma.productPackage.create({
      data: { isBase: true, productItemId: stockedProduct.id },
    });
    await prisma.productShipment.create({
      data: {
        warehouseId: warehouse.id,
        productItemId: stockedProduct.id,
        arrivalDate: new Date(),
        quantity: '5',
      },
    });
  });

  beforeEach(async () => {
    await prisma.productItem.updateMany({
      where: { id: { in: [zeroStockProductId, stockedProductId] } },
      data: { archivedAt: null, archivedByEmployeeId: null },
    });
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  it('requires authentication and product archive permission for mutations', async () => {
    await request(app.getHttpServer()).get('/api/product-item/archive').expect(401);
    await request(app.getHttpServer())
      .put(`/api/product-item/${zeroStockProductId}/archive`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/product-item/${zeroStockProductId}/archive`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
  });

  it('archives an out-of-stock product idempotently and lists it by SKU', async () => {
    const first = await request(app.getHttpServer())
      .put(`/api/product-item/${zeroStockProductId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .put(`/api/product-item/${zeroStockProductId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(() => ProductItemWithRelationsSchema.parse(first.body)).not.toThrow();
    expect(first.body).toMatchObject({
      id: zeroStockProductId,
      archivedAt: expect.any(String),
      archivedByEmployeeId: adminId,
    });
    expect(second.body.archivedAt).toBe(first.body.archivedAt);

    const archive = await request(app.getHttpServer())
      .get('/api/product-item/archive?page=1&limit=100')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(archive.body.items).toEqual([
      expect.objectContaining({ id: zeroStockProductId, archivedAt: first.body.archivedAt }),
    ]);
  });

  it('rejects archiving while any warehouse has positive stock', async () => {
    await request(app.getHttpServer())
      .put(`/api/product-item/${stockedProductId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    expect(
      await prisma.productItem.findUniqueOrThrow({ where: { id: stockedProductId } }),
    ).toMatchObject({ archivedAt: null, archivedByEmployeeId: null });
  });

  it('rejects new stock for an archived product at the database boundary', async () => {
    await request(app.getHttpServer())
      .put(`/api/product-item/${zeroStockProductId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const existingShipment = await prisma.productShipment.findUniqueOrThrow({
      where: { id: zeroStockShipmentId },
    });

    await expect(
      prisma.productShipment.create({
        data: {
          warehouseId: existingShipment.warehouseId,
          productItemId: zeroStockProductId,
          arrivalDate: new Date(),
          quantity: '1',
        },
      }),
    ).rejects.toBeDefined();
  });

  it('returns an archive tombstone through product item sync', async () => {
    const initial = await request(app.getHttpServer())
      .get('/api/sync/pull?table=product_item&limit=100')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await request(app.getHttpServer())
      .put(`/api/product-item/${zeroStockProductId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const changes = await request(app.getHttpServer())
      .get(`/api/sync/pull?table=product_item&limit=100&since=${initial.body.cursor}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(changes.body.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: zeroStockProductId })]),
    );
    expect(changes.body.deletedIds).toContain(zeroStockProductId);

    for (const table of [
      'product_barcode',
      'product_package',
      'product_shipment',
      'product_item_stats',
    ]) {
      const response = await request(app.getHttpServer())
        .get(`/api/sync/pull?table=${table}&limit=100`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(response.body.items).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ productItemId: zeroStockProductId })]),
      );
    }
  });

  it('restores the product and advances every dependent sync cursor source', async () => {
    await request(app.getHttpServer())
      .put(`/api/product-item/${zeroStockProductId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const before = await Promise.all([
      prisma.productBarcode.findUniqueOrThrow({ where: { id: zeroStockBarcodeId } }),
      prisma.productPackage.findUniqueOrThrow({ where: { id: zeroStockPackageId } }),
      prisma.productShipment.findUniqueOrThrow({ where: { id: zeroStockShipmentId } }),
      prisma.productItemStats.findUniqueOrThrow({ where: { id: zeroStockStatsId } }),
    ]);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const restored = await request(app.getHttpServer())
      .delete(`/api/product-item/${zeroStockProductId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(restored.body).toMatchObject({
      id: zeroStockProductId,
      archivedAt: null,
      archivedByEmployeeId: null,
    });
    const after = await Promise.all([
      prisma.productBarcode.findUniqueOrThrow({ where: { id: zeroStockBarcodeId } }),
      prisma.productPackage.findUniqueOrThrow({ where: { id: zeroStockPackageId } }),
      prisma.productShipment.findUniqueOrThrow({ where: { id: zeroStockShipmentId } }),
      prisma.productItemStats.findUniqueOrThrow({ where: { id: zeroStockStatsId } }),
    ]);
    after.forEach((row, index) => {
      expect(row.updatedAt.getTime()).toBeGreaterThan(before[index]!.updatedAt.getTime());
    });
  });

  it('finds archived items by barcode without exposing them through active fetch', async () => {
    await request(app.getHttpServer())
      .put(`/api/product-item/${zeroStockProductId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const barcode = await prisma.productBarcode.findUniqueOrThrow({
      where: { id: zeroStockBarcodeId },
    });

    const lookup = await request(app.getHttpServer())
      .get(`/api/product-item/barcode?code=${encodeURIComponent(barcode.code)}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(lookup.body).toMatchObject({ id: zeroStockProductId, archivedAt: expect.any(String) });

    const activeFetch = await request(app.getHttpServer())
      .get(`/api/sync/fetch/product-items?id=${zeroStockProductId}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(activeFetch.body.items).toEqual([]);
  });
});
