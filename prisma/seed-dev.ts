import { PrismaClient, CurrencyCode } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

const ITEM_COUNT = 300;
const ORG_COUNT = 3;
const WAREHOUSE_PER_ORG = 2;
const COLLECTION_COUNT = 8;
const TYPE_COUNT = 6;
const BRAND_COUNT = 15;
const SHIPMENT_RATIO = 0.7; // 70% of items have stock on a warehouse

async function main() {
  console.log('🧹 Cleaning dev data...');

  // Delete in FK order — employees/roles are excluded
  await prisma.productPrice.deleteMany();
  await prisma.priceListAssignment.deleteMany();
  await prisma.priceList.deleteMany();
  await prisma.productShipment.deleteMany();
  await prisma.productBarcode.deleteMany();
  await prisma.productPackage.deleteMany();
  await prisma.productItem.deleteMany();
  await prisma.productCollection.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.productBrand.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.locality.deleteMany();
  // Countries and measures are managed by base seed — skip

  console.log('📦 Seeding organizations & localities...');

  const countries = await prisma.country.findMany({ select: { id: true } });
  if (countries.length === 0) {
    throw new Error('Run base seed first (pnpm seed) — no countries found');
  }

  const measures = await prisma.productMeasure.findMany({ select: { id: true } });
  if (measures.length === 0) {
    throw new Error('Run base seed first (pnpm seed) — no measures found');
  }

  const localities = await Promise.all(
    Array.from({ length: ORG_COUNT + 2 }, () =>
      prisma.locality.create({
        data: {
          name: faker.location.city(),
          countryId: faker.helpers.arrayElement(countries).id,
        },
      }),
    ),
  );

  const organizations = await Promise.all(
    Array.from({ length: ORG_COUNT }, () =>
      prisma.organization.create({
        data: { name: faker.company.name() },
      }),
    ),
  );

  console.log('🏭 Seeding warehouses...');

  const warehouses = [];
  for (const org of organizations) {
    for (let i = 0; i < WAREHOUSE_PER_ORG; i++) {
      const locality = faker.helpers.arrayElement(localities);
      const warehouse = await prisma.warehouse.create({
        data: {
          address: faker.location.streetAddress(true),
          note: faker.datatype.boolean() ? faker.lorem.sentence() : null,
          code: faker.string.alphanumeric(6).toUpperCase(),
          organizationId: org.id,
          localityId: locality.id,
        },
      });
      warehouses.push(warehouse);
    }
  }

  console.log('🏷️  Seeding product brands...');

  const brandNames: string[] = [];
  while (brandNames.length < BRAND_COUNT) {
    const name = faker.company.name();
    if (!brandNames.includes(name)) brandNames.push(name);
  }
  await prisma.productBrand.createMany({
    data: brandNames.map((name) => ({ name })),
  });
  const brands = await prisma.productBrand.findMany({ select: { id: true } });

  console.log('📂 Seeding product types & collections...');

  await prisma.productType.createMany({
    data: Array.from({ length: TYPE_COUNT }, (_, i) => ({
      name: faker.commerce.productMaterial() + ' ' + (i + 1),
      defaultWriteoffStrategy: faker.helpers.arrayElement(['FIFO', 'LIFO', 'FEFO']),
      skuMode: faker.helpers.arrayElement(['GLOBAL', 'CUSTOM']),
    })),
  });
  const types = await prisma.productType.findMany({ select: { id: true } });

  const collections = await Promise.all(
    Array.from({ length: COLLECTION_COUNT }, () =>
      prisma.productCollection.create({
        data: {
          name: faker.commerce.department(),
          defaultProductTypeId: faker.helpers.arrayElement(types).id,
        },
      }),
    ),
  );

  console.log(`📦 Seeding ${ITEM_COUNT} product items...`);

  // Generate items in batches to avoid memory issues
  const BATCH_SIZE = 100;
  const allItemIds: number[] = [];

  for (let batch = 0; batch < Math.ceil(ITEM_COUNT / BATCH_SIZE); batch++) {
    const batchCount = Math.min(BATCH_SIZE, ITEM_COUNT - batch * BATCH_SIZE);

    const itemsData = Array.from({ length: batchCount }, () => {
      const collection = faker.helpers.arrayElement(collections);
      const type = faker.helpers.arrayElement(types);
      return {
        sku: faker.string.alphanumeric(8).toUpperCase(),
        name: faker.commerce.productName(),
        productCollectionId: collection.id,
        productTypeId: type.id,
        productBrandId:
          faker.helpers.maybe(() => faker.helpers.arrayElement(brands).id, { probability: 0.8 }) ??
          null,
        productMeasureId:
          faker.helpers.maybe(() => faker.helpers.arrayElement(measures).id, {
            probability: 0.7,
          }) ?? null,
        characteristics: {},
        isPublic: faker.datatype.boolean({ probability: 0.6 }),
      };
    });

    await prisma.productItem.createMany({ data: itemsData });
  }

  // Fetch all item IDs for package/shipment generation
  const items = await prisma.productItem.findMany({
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  for (const item of items) allItemIds.push(item.id);

  console.log('📦 Seeding product packages...');

  // Base package for every item
  await prisma.productPackage.createMany({
    data: allItemIds.map((itemId) => ({
      productItemId: itemId,
      isBase: true,
      conversionFactor: 1,
    })),
  });

  // Derivative packages for ~40% of items
  const derivativeItemIds = faker.helpers.arrayElements(
    allItemIds,
    Math.floor(allItemIds.length * 0.4),
  );
  const derivativePackages = derivativeItemIds.map((itemId) => ({
    productItemId: itemId,
    isBase: false,
    name: faker.helpers.arrayElement(['короб', 'ящик', 'упаковка', 'палета', 'контейнер']),
    conversionFactor: faker.helpers.arrayElement([6, 12, 24, 48, 100]),
  }));
  if (derivativePackages.length > 0) {
    await prisma.productPackage.createMany({ data: derivativePackages });
  }

  console.log('💰 Seeding price lists...');

  // Default price list (should already exist from setup, but ensure)
  const defaultPriceList = await prisma.priceList.upsert({
    where: { id: 1 },
    update: {},
    create: { name: 'Default', currency: CurrencyCode.EUR, isDefault: true },
  });

  // Additional price lists
  const customCurrencies = [CurrencyCode.USD, CurrencyCode.RUB, CurrencyCode.UAH, CurrencyCode.GBP];
  const customPriceLists = await Promise.all(
    customCurrencies.map((currency) =>
      prisma.priceList.create({
        data: {
          name: `${currency} Price List`,
          currency,
          isDefault: false,
        },
      }),
    ),
  );

  console.log('🔗 Seeding price list assignments...');

  // Assign one price list per warehouse
  const assignments: {
    priceListId: number;
    targetType: 'WAREHOUSE' | 'ORGANIZATION' | 'LOCALITY' | 'COUNTRY';
    warehouseId?: number;
    organizationId?: number;
    localityId?: number;
    countryId?: number;
  }[] = [];

  for (const warehouse of warehouses) {
    const priceList = faker.helpers.arrayElement(customPriceLists);
    assignments.push({
      priceListId: priceList.id,
      targetType: 'WAREHOUSE',
      warehouseId: warehouse.id,
    });
  }
  // Assign one price list to first organization
  if (organizations.length > 0) {
    assignments.push({
      priceListId: customPriceLists[0].id,
      targetType: 'ORGANIZATION',
      organizationId: organizations[0].id,
    });
  }
  // Assign one price list to first locality
  if (localities.length > 0) {
    assignments.push({
      priceListId: customPriceLists[1].id,
      targetType: 'LOCALITY',
      localityId: localities[0].id,
    });
  }
  // Assign one price list to first country
  if (countries.length > 0) {
    assignments.push({
      priceListId: customPriceLists[2].id,
      targetType: 'COUNTRY',
      countryId: countries[0].id,
    });
  }

  await prisma.priceListAssignment.createMany({ data: assignments });

  console.log('💲 Seeding product prices...');

  const basePackages = await prisma.productPackage.findMany({
    where: { isBase: true },
    select: { id: true },
  });

  const allPriceLists = [defaultPriceList, ...customPriceLists];
  const pricesData: { priceListId: number; productPackageId: number; priceAmount: bigint }[] = [];

  for (const pkg of basePackages) {
    // Every item gets a price in the default price list
    pricesData.push({
      priceListId: defaultPriceList.id,
      productPackageId: pkg.id,
      priceAmount: BigInt(faker.number.int({ min: 50, max: 50000 })),
    });

    // ~30% of items also get a price in a random custom price list
    if (faker.datatype.boolean({ probability: 0.3 })) {
      const customList = faker.helpers.arrayElement(customPriceLists);
      pricesData.push({
        priceListId: customList.id,
        productPackageId: pkg.id,
        priceAmount: BigInt(faker.number.int({ min: 100, max: 100000 })),
      });
    }
  }

  // Insert prices in batches
  for (let i = 0; i < pricesData.length; i += BATCH_SIZE) {
    await prisma.productPrice.createMany({ data: pricesData.slice(i, i + BATCH_SIZE) });
  }

  console.log('🚚 Seeding product shipments...');

  const shipmentsData: {
    warehouseId: number;
    productItemId: number;
    arrivalDate: Date;
    expiryDate: Date | null;
    quantity: number;
    priceAmount: bigint;
    currency: CurrencyCode;
  }[] = [];

  for (const itemId of allItemIds) {
    for (const warehouse of warehouses) {
      if (faker.datatype.boolean({ probability: SHIPMENT_RATIO })) {
        shipmentsData.push({
          warehouseId: warehouse.id,
          productItemId: itemId,
          arrivalDate: faker.date.past({ years: 1 }),
          expiryDate: faker.datatype.boolean({ probability: 0.3 })
            ? faker.date.future({ years: 2 })
            : null,
          quantity: faker.number.float({ min: 1, max: 500, fractionDigits: 2 }),
          priceAmount: BigInt(faker.number.int({ min: 100, max: 50000 })),
          currency: faker.helpers.arrayElement([
            CurrencyCode.EUR,
            CurrencyCode.USD,
            CurrencyCode.RUB,
          ]),
        });
      }
    }
  }

  for (let i = 0; i < shipmentsData.length; i += BATCH_SIZE) {
    await prisma.productShipment.createMany({ data: shipmentsData.slice(i, i + BATCH_SIZE) });
  }

  console.log(`✅ Dev seed complete!`);
  console.log(`   ${organizations.length} organizations`);
  console.log(`   ${warehouses.length} warehouses`);
  console.log(`   ${collections.length} collections`);
  console.log(`   ${allItemIds.length} items`);
  console.log(`   ${basePackages.length} base packages`);
  console.log(`   ${derivativePackages.length} derivative packages`);
  console.log(`   ${allPriceLists.length} price lists`);
  console.log(`   ${assignments.length} price list assignments`);
  console.log(`   ${pricesData.length} prices`);
  console.log(`   ${shipmentsData.length} shipments`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
