import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { cleanDatabase, createApp, seedAdmin } from './helpers';

describe('PriceList (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let noPermToken: string;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(prisma);
    ({ access_token: adminToken } = await seedAdmin(app));

    const email = 'noperm-price-list@e2e.test';
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
      .send({ email, password });
    noPermToken = login.body.access_token as string;
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  describe('GET /api/price-list', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/price-list').expect(401);
    });

    it('returns price lists to an authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/price-list')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Default', currency: 'EUR', isDefault: true }),
        ]),
      );
    });
  });

  describe('POST /api/price-list', () => {
    it('returns 403 without price_list:create permission', async () => {
      await request(app.getHttpServer())
        .post('/api/price-list')
        .set('Authorization', `Bearer ${noPermToken}`)
        .send({ name: 'Blocked', currency: 'EUR' })
        .expect(403);
    });

    it('creates a price list', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/price-list')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Retail EUR', currency: 'EUR' })
        .expect(201);

      expect(response.body).toMatchObject({
        name: 'Retail EUR',
        currency: 'EUR',
        isDefault: false,
      });
    });
  });

  describe('PATCH /api/price-list/:id currency', () => {
    let emptyPriceListId: number;
    let pricedPriceListId: number;
    let productItemId: number;
    let warehouseId: number;

    beforeAll(async () => {
      const suffix = Date.now();
      const country = await prisma.country.findUniqueOrThrow({ where: { code: 'AU' } });
      const locality = await prisma.locality.create({
        data: { name: `Price list locality ${suffix}`, countryId: country.id },
      });
      const organization = await prisma.organization.create({
        data: { name: `Price list organization ${suffix}` },
      });
      const warehouse = await prisma.warehouse.create({
        data: {
          address: `Price list warehouse ${suffix}`,
          code: `PRICE-${suffix}`,
          localityId: locality.id,
          organizationId: organization.id,
        },
      });
      const productType = await prisma.productType.create({
        data: { name: `Price list product type ${suffix}` },
      });
      const productItem = await prisma.productItem.create({
        data: {
          sku: `PRICE-${suffix}`,
          name: `Price list product ${suffix}`,
          productTypeId: productType.id,
        },
      });
      const productPackage = await prisma.productPackage.create({
        data: {
          name: 'Base',
          isBase: true,
          productItemId: productItem.id,
        },
      });
      const emptyPriceList = await prisma.priceList.create({
        data: { name: `Empty ${suffix}`, currency: 'EUR' },
      });
      const pricedPriceList = await prisma.priceList.create({
        data: { name: `Priced ${suffix}`, currency: 'EUR' },
      });

      await prisma.productPrice.create({
        data: {
          priceListId: pricedPriceList.id,
          productPackageId: productPackage.id,
          priceAmount: 12345n,
        },
      });
      await prisma.priceListAssignment.create({
        data: {
          priceListId: pricedPriceList.id,
          targetType: 'WAREHOUSE',
          warehouseId: warehouse.id,
        },
      });

      emptyPriceListId = emptyPriceList.id;
      pricedPriceListId = pricedPriceList.id;
      productItemId = productItem.id;
      warehouseId = warehouse.id;
    });

    it('allows changing the currency of an empty price list', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/price-list/${emptyPriceListId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ currency: 'USD' })
        .expect(200);

      expect(response.body).toMatchObject({ id: emptyPriceListId, currency: 'USD' });
    });

    it('rejects changing the currency when the price list contains prices', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/price-list/${pricedPriceListId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ currency: 'USD' })
        .expect(409);

      expect(response.body.message).toBe(
        'Cannot change the currency of a price list that contains prices',
      );
      await expect(
        prisma.priceList.findUniqueOrThrow({ where: { id: pricedPriceListId } }),
      ).resolves.toMatchObject({ currency: 'EUR' });
    });

    it('recalculates materialized stats when currency changes outside the API', async () => {
      await prisma.priceList.update({
        where: { id: pricedPriceListId },
        data: { currency: 'USD' },
      });

      const stats = await prisma.productItemStats.findUniqueOrThrow({
        where: { productItemId_warehouseId: { productItemId, warehouseId } },
      });
      expect(stats.retailPrice).toBe(12345n);
      expect(stats.currency).toBe('USD');
    });
  });

  describe('price list assignments', () => {
    let firstPriceListId: number;
    let secondPriceListId: number;
    let organizationId: number;
    let firstWarehouseId: number;
    let secondWarehouseId: number;

    beforeAll(async () => {
      const suffix = Date.now();
      const country = await prisma.country.findUniqueOrThrow({ where: { code: 'AU' } });
      const locality = await prisma.locality.create({
        data: { name: `Assignment locality ${suffix}`, countryId: country.id },
      });
      const organization = await prisma.organization.create({
        data: { name: `Assignment organization ${suffix}` },
      });
      const [firstWarehouse, secondWarehouse] = await Promise.all([
        prisma.warehouse.create({
          data: {
            address: `Assignment warehouse one ${suffix}`,
            code: `ASSIGN-1-${suffix}`,
            localityId: locality.id,
            organizationId: organization.id,
          },
        }),
        prisma.warehouse.create({
          data: {
            address: `Assignment warehouse two ${suffix}`,
            code: `ASSIGN-2-${suffix}`,
            localityId: locality.id,
            organizationId: organization.id,
          },
        }),
      ]);
      const [firstPriceList, secondPriceList] = await Promise.all([
        prisma.priceList.create({ data: { name: `Assignment one ${suffix}`, currency: 'EUR' } }),
        prisma.priceList.create({ data: { name: `Assignment two ${suffix}`, currency: 'EUR' } }),
      ]);

      firstPriceListId = firstPriceList.id;
      secondPriceListId = secondPriceList.id;
      organizationId = organization.id;
      firstWarehouseId = firstWarehouse.id;
      secondWarehouseId = secondWarehouse.id;
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get(`/api/price-list/${firstPriceListId}/assignments`)
        .expect(401);
    });

    it('returns 403 when replacing assignments without permission', async () => {
      await request(app.getHttpServer())
        .put(`/api/price-list/${firstPriceListId}/assignments`)
        .set('Authorization', `Bearer ${noPermToken}`)
        .send({
          warehouseIds: [firstWarehouseId],
          organizationIds: [],
          localityIds: [],
          countryIds: [],
        })
        .expect(403);
    });

    it('assigns one price list to multiple warehouses', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/price-list/${firstPriceListId}/assignments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          warehouseIds: [firstWarehouseId, secondWarehouseId],
          organizationIds: [organizationId],
          localityIds: [],
          countryIds: [],
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ warehouseId: firstWarehouseId, targetType: 'WAREHOUSE' }),
          expect.objectContaining({ warehouseId: secondWarehouseId, targetType: 'WAREHOUSE' }),
          expect.objectContaining({ organizationId, targetType: 'ORGANIZATION' }),
        ]),
      );
    });

    it('rejects assigning an occupied target to another price list', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/price-list/${secondPriceListId}/assignments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          warehouseIds: [firstWarehouseId],
          organizationIds: [],
          localityIds: [],
          countryIds: [],
        })
        .expect(409);

      expect(response.body.message).toBe('One or more targets are assigned to another price list');
    });

    it('rejects duplicate and unknown target ids', async () => {
      await request(app.getHttpServer())
        .put(`/api/price-list/${secondPriceListId}/assignments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          warehouseIds: [secondWarehouseId, secondWarehouseId],
          organizationIds: [],
          localityIds: [],
          countryIds: [],
        })
        .expect(400);

      await request(app.getHttpServer())
        .put(`/api/price-list/${secondPriceListId}/assignments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          warehouseIds: [999999],
          organizationIds: [],
          localityIds: [],
          countryIds: [],
        })
        .expect(400);
    });
  });

  describe('product prices', () => {
    let priceListId: number;
    let firstPackageId: number;
    let secondPackageId: number;

    beforeAll(async () => {
      const suffix = Date.now();
      const productType = await prisma.productType.create({
        data: { name: `Prices product type ${suffix}` },
      });
      const productItem = await prisma.productItem.create({
        data: {
          sku: `PRICES-${suffix}`,
          name: `Prices product ${suffix}`,
          productTypeId: productType.id,
        },
      });
      const [firstPackage, secondPackage, priceList] = await Promise.all([
        prisma.productPackage.create({
          data: { name: 'Base', isBase: true, productItemId: productItem.id },
        }),
        prisma.productPackage.create({
          data: { name: 'Box', conversionFactor: 10, productItemId: productItem.id },
        }),
        prisma.priceList.create({ data: { name: `Prices ${suffix}`, currency: 'EUR' } }),
      ]);

      priceListId = priceList.id;
      firstPackageId = firstPackage.id;
      secondPackageId = secondPackage.id;
    });

    it('returns 403 when updating prices without permission', async () => {
      await request(app.getHttpServer())
        .put(`/api/price-list/${priceListId}/prices`)
        .set('Authorization', `Bearer ${noPermToken}`)
        .send({ upserted: [], removedProductPackageIds: [] })
        .expect(403);
    });

    it('creates and returns prices as minor-unit strings', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/price-list/${priceListId}/prices`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          upserted: [
            { productPackageId: firstPackageId, priceAmount: '12345' },
            { productPackageId: secondPackageId, priceAmount: '9999999999999999' },
          ],
          removedProductPackageIds: [],
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ productPackageId: firstPackageId, priceAmount: '12345' }),
          expect.objectContaining({
            productPackageId: secondPackageId,
            priceAmount: '9999999999999999',
          }),
        ]),
      );
    });

    it('updates one price and removes another without replacing unrelated data', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/price-list/${priceListId}/prices`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          upserted: [{ productPackageId: firstPackageId, priceAmount: '15000' }],
          removedProductPackageIds: [secondPackageId],
        })
        .expect(200);

      expect(response.body).toEqual([
        expect.objectContaining({ productPackageId: firstPackageId, priceAmount: '15000' }),
      ]);
    });

    it('rejects overlapping or unknown product package ids', async () => {
      await request(app.getHttpServer())
        .put(`/api/price-list/${priceListId}/prices`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          upserted: [{ productPackageId: firstPackageId, priceAmount: '100' }],
          removedProductPackageIds: [firstPackageId],
        })
        .expect(400);

      await request(app.getHttpServer())
        .put(`/api/price-list/${priceListId}/prices`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          upserted: [{ productPackageId: 999999, priceAmount: '100' }],
          removedProductPackageIds: [],
        })
        .expect(400);
    });
  });

  describe('hierarchical price recalculation', () => {
    let productItemId: number;
    let warehouseId: number;
    let secondOrganizationId: number;
    let localityId: number;
    let secondCountryId: number;

    beforeAll(async () => {
      const suffix = Date.now();
      const firstCountry = await prisma.country.findUniqueOrThrow({ where: { code: 'AU' } });
      const secondCountry = await prisma.country.upsert({
        where: { code: 'NZ' },
        update: {},
        create: { code: 'NZ' },
      });
      const locality = await prisma.locality.create({
        data: { name: `Hierarchy locality ${suffix}`, countryId: firstCountry.id },
      });
      const [firstOrganization, secondOrganization] = await Promise.all([
        prisma.organization.create({ data: { name: `Hierarchy organization A ${suffix}` } }),
        prisma.organization.create({ data: { name: `Hierarchy organization B ${suffix}` } }),
      ]);
      const warehouse = await prisma.warehouse.create({
        data: {
          address: `Hierarchy warehouse ${suffix}`,
          code: `HIERARCHY-${suffix}`,
          localityId: locality.id,
          organizationId: firstOrganization.id,
        },
      });
      const productType = await prisma.productType.create({
        data: { name: `Hierarchy product type ${suffix}` },
      });
      const productItem = await prisma.productItem.create({
        data: {
          sku: `HIERARCHY-${suffix}`,
          name: `Hierarchy product ${suffix}`,
          productTypeId: productType.id,
        },
      });
      const productPackage = await prisma.productPackage.create({
        data: { name: 'Base', isBase: true, productItemId: productItem.id },
      });
      const [firstOrganizationPrices, secondOrganizationPrices, secondCountryPrices] =
        await Promise.all([
          prisma.priceList.create({
            data: { name: `Hierarchy organization A ${suffix}`, currency: 'EUR' },
          }),
          prisma.priceList.create({
            data: { name: `Hierarchy organization B ${suffix}`, currency: 'EUR' },
          }),
          prisma.priceList.create({
            data: { name: `Hierarchy country B ${suffix}`, currency: 'EUR' },
          }),
        ]);

      await prisma.productPrice.createMany({
        data: [
          {
            priceListId: firstOrganizationPrices.id,
            productPackageId: productPackage.id,
            priceAmount: 1000n,
          },
          {
            priceListId: secondOrganizationPrices.id,
            productPackageId: productPackage.id,
            priceAmount: 2000n,
          },
          {
            priceListId: secondCountryPrices.id,
            productPackageId: productPackage.id,
            priceAmount: 3000n,
          },
        ],
      });
      await prisma.priceListAssignment.createMany({
        data: [
          {
            priceListId: firstOrganizationPrices.id,
            targetType: 'ORGANIZATION',
            organizationId: firstOrganization.id,
          },
          {
            priceListId: secondOrganizationPrices.id,
            targetType: 'ORGANIZATION',
            organizationId: secondOrganization.id,
          },
          {
            priceListId: secondCountryPrices.id,
            targetType: 'COUNTRY',
            countryId: secondCountry.id,
          },
        ],
      });

      productItemId = productItem.id;
      warehouseId = warehouse.id;
      secondOrganizationId = secondOrganization.id;
      localityId = locality.id;
      secondCountryId = secondCountry.id;
    });

    it('recalculates stats when a warehouse moves to another organization', async () => {
      await expect(
        prisma.productItemStats.findUniqueOrThrow({
          where: { productItemId_warehouseId: { productItemId, warehouseId } },
        }),
      ).resolves.toMatchObject({ retailPrice: 1000n });

      await prisma.warehouse.update({
        where: { id: warehouseId },
        data: { organizationId: secondOrganizationId },
      });

      await expect(
        prisma.productItemStats.findUniqueOrThrow({
          where: { productItemId_warehouseId: { productItemId, warehouseId } },
        }),
      ).resolves.toMatchObject({ retailPrice: 2000n });
    });

    it('recalculates stats when a locality moves to another country', async () => {
      await prisma.priceListAssignment.deleteMany({
        where: { organizationId: secondOrganizationId },
      });
      await prisma.locality.update({
        where: { id: localityId },
        data: { countryId: secondCountryId },
      });

      const stats = await prisma.productItemStats.findUniqueOrThrow({
        where: { productItemId_warehouseId: { productItemId, warehouseId } },
      });
      expect(stats.retailPrice).toBe(3000n);
    });
  });
});
