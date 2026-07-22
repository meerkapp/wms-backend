import {
  BarcodeType,
  CurrencyCode,
  PriceListTargetType,
  PrismaClient,
  SkuMode,
  WriteoffStrategy,
} from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

const ITEM_COUNT = 300;
const COLLECTION_COUNT = 8;
const TYPE_COUNT = 6;
const BRAND_COUNT = 15;
const BATCH_SIZE = 100;
const SHIPMENT_RATIO = 0.7;
const PRICE_FIXTURE_ITEM_COUNT = 10;
const NON_ISO_REGION_CODES = ['AC', 'DG', 'EA', 'EU', 'IC', 'TA', 'XK'];

const parsedFakerSeed = Number(process.env.DEV_SEED ?? '20260721');
if (!Number.isSafeInteger(parsedFakerSeed)) {
  throw new Error('DEV_SEED must be a safe integer');
}

const LOCALITY_FIXTURES = [
  { name: 'Москва', countryCode: 'RU' },
  { name: 'Санкт-Петербург', countryCode: 'RU' },
  { name: 'Киев', countryCode: 'UA' },
  { name: 'Львов', countryCode: 'UA' },
  { name: 'Варшава', countryCode: 'PL' },
  { name: 'Краков', countryCode: 'PL' },
] as const;

const ORGANIZATION_NAMES = ['Dev North', 'Dev Central', 'Dev West'] as const;

const WAREHOUSE_FIXTURES = [
  { code: 'DEV-WH-01', organizationIndex: 0, localityIndex: 0 },
  { code: 'DEV-WH-02', organizationIndex: 0, localityIndex: 1 },
  { code: 'DEV-WH-03', organizationIndex: 1, localityIndex: 2 },
  { code: 'DEV-WH-04', organizationIndex: 1, localityIndex: 3 },
  { code: 'DEV-WH-05', organizationIndex: 2, localityIndex: 4 },
  { code: 'DEV-WH-06', organizationIndex: 2, localityIndex: 5 },
] as const;

function makeEan13(sequence: number): string {
  const body = `200${sequence.toString().padStart(9, '0')}`;
  const sum = [...body].reduce((total, digit, index) => {
    return total + Number(digit) * (index % 2 === 0 ? 1 : 3);
  }, 0);
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${body}${checkDigit}`;
}

async function deleteFolders(): Promise<void> {
  while ((await prisma.folder.count()) > 0) {
    const result = await prisma.folder.deleteMany({
      where: { children: { none: {} } },
    });
    if (result.count === 0) {
      throw new Error('Unable to remove the existing folder tree');
    }
  }
}

async function cleanDevData(): Promise<string[]> {
  const assignedEmployees = await prisma.employee.findMany({
    where: { warehouseId: { not: null } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  await prisma.productPrice.deleteMany();
  await prisma.priceListAssignment.deleteMany();
  await prisma.priceList.deleteMany();
  await prisma.productShipment.deleteMany();
  await prisma.productBarcode.deleteMany();
  await prisma.productPackage.deleteMany();
  await prisma.productItem.deleteMany();
  await prisma.productCollection.deleteMany();
  await deleteFolders();
  await prisma.productType.deleteMany();
  await prisma.productBrand.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.locality.deleteMany();
  await prisma.country.deleteMany({
    where: { code: { in: NON_ISO_REGION_CODES } },
  });

  return assignedEmployees.map(({ id }) => id);
}

async function main(): Promise<void> {
  faker.seed(parsedFakerSeed);

  console.log(`🧹 Cleaning dev data (faker seed: ${parsedFakerSeed})...`);
  const employeeIdsToReassign = await cleanDevData();

  const requiredCountryCodes = [
    ...new Set(LOCALITY_FIXTURES.map(({ countryCode }) => countryCode)),
  ];
  const countries = await prisma.country.findMany({
    where: { code: { in: requiredCountryCodes } },
    select: { id: true, code: true },
  });
  const countryByCode = new Map(countries.map((country) => [country.code.trim(), country]));
  const missingCountryCodes = requiredCountryCodes.filter((code) => !countryByCode.has(code));
  if (missingCountryCodes.length > 0) {
    throw new Error(
      `Run the base seed first (npm run seed). Missing countries: ${missingCountryCodes.join(', ')}`,
    );
  }

  const measures = await prisma.productMeasure.findMany({
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (measures.length === 0) {
    throw new Error('Run the base seed first (npm run seed). No measures found.');
  }

  console.log('📦 Seeding organizations, localities and warehouses...');

  const localities = await Promise.all(
    LOCALITY_FIXTURES.map(({ name, countryCode }) =>
      prisma.locality.create({
        data: {
          name,
          countryId: countryByCode.get(countryCode)!.id,
        },
      }),
    ),
  );

  const organizations = await Promise.all(
    ORGANIZATION_NAMES.map((name) => prisma.organization.create({ data: { name } })),
  );

  const warehouses = await Promise.all(
    WAREHOUSE_FIXTURES.map((fixture, index) =>
      prisma.warehouse.create({
        data: {
          address: `Dev warehouse address ${index + 1}`,
          note: index % 2 === 0 ? faker.lorem.sentence() : null,
          code: fixture.code,
          organizationId: organizations[fixture.organizationIndex].id,
          localityId: localities[fixture.localityIndex].id,
        },
      }),
    ),
  );

  if (employeeIdsToReassign.length > 0) {
    await prisma.$transaction(
      employeeIdsToReassign.map((employeeId, index) =>
        prisma.employee.update({
          where: { id: employeeId },
          data: { warehouseId: warehouses[index % warehouses.length].id },
        }),
      ),
    );
  }

  console.log('🏷️  Seeding product brands, types and folders...');

  const brandNames = new Set<string>();
  while (brandNames.size < BRAND_COUNT) {
    brandNames.add(faker.company.name());
  }
  await prisma.productBrand.createMany({
    data: [...brandNames].map((name) => ({ name })),
  });
  const brands = await prisma.productBrand.findMany({
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  const writeoffStrategies = [WriteoffStrategy.FIFO, WriteoffStrategy.LIFO, WriteoffStrategy.FEFO];
  const skuModes = [SkuMode.GLOBAL, SkuMode.CUSTOM];
  await prisma.productType.createMany({
    data: Array.from({ length: TYPE_COUNT }, (_, index) => ({
      name: `${faker.commerce.productMaterial()} ${index + 1}`,
      defaultWriteoffStrategy: faker.helpers.arrayElement(writeoffStrategies),
      skuMode: faker.helpers.arrayElement(skuModes),
    })),
  });
  const types = await prisma.productType.findMany({
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  const rootFolder = await prisma.folder.create({ data: { name: 'Dev catalog' } });
  const childFolder = await prisma.folder.create({
    data: { name: 'Dev featured', parentId: rootFolder.id },
  });
  const secondaryFolder = await prisma.folder.create({ data: { name: 'Dev archive' } });
  const folderIds = [rootFolder.id, childFolder.id, secondaryFolder.id];

  const collections = await Promise.all(
    Array.from({ length: COLLECTION_COUNT }, (_, index) =>
      prisma.productCollection.create({
        data: {
          name: `${faker.commerce.department()} ${index + 1}`,
          folderId: folderIds[index % folderIds.length],
          defaultProductTypeId: faker.helpers.arrayElement(types).id,
        },
      }),
    ),
  );

  console.log(`📦 Seeding ${ITEM_COUNT} product items...`);

  for (let batchStart = 0; batchStart < ITEM_COUNT; batchStart += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, ITEM_COUNT - batchStart);
    const itemsData = Array.from({ length: batchCount }, (_, batchIndex) => {
      const itemIndex = batchStart + batchIndex;
      return {
        sku: `DEV-SKU-${(itemIndex + 1).toString().padStart(6, '0')}`,
        name: faker.commerce.productName(),
        productCollectionId: faker.helpers.arrayElement(collections).id,
        productTypeId: faker.helpers.arrayElement(types).id,
        productBrandId:
          faker.helpers.maybe(() => faker.helpers.arrayElement(brands).id, { probability: 0.8 }) ??
          null,
        productMeasureId: measures[itemIndex % measures.length].id,
        countryId:
          faker.helpers.maybe(() => faker.helpers.arrayElement(countries).id, {
            probability: 0.5,
          }) ?? null,
        characteristics: {},
        isPublic: faker.datatype.boolean({ probability: 0.6 }),
      };
    });

    await prisma.productItem.createMany({ data: itemsData });
  }

  const items = await prisma.productItem.findMany({
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const allItemIds = items.map(({ id }) => id);

  console.log('🔎 Seeding product barcodes and packages...');

  await prisma.productBarcode.createMany({
    data: allItemIds.map((productItemId, index) => ({
      productItemId,
      code: makeEan13(index + 1),
      type: BarcodeType.FACTORY,
    })),
  });

  await prisma.productPackage.createMany({
    data: allItemIds.map((productItemId) => ({
      productItemId,
      isBase: true,
      conversionFactor: 1,
    })),
  });

  const derivativeItemIds = faker.helpers.arrayElements(
    allItemIds,
    Math.floor(allItemIds.length * 0.4),
  );
  const derivativePackages = derivativeItemIds.map((productItemId) => ({
    productItemId,
    isBase: false,
    name: faker.helpers.arrayElement(['короб', 'ящик', 'упаковка', 'палета', 'контейнер']),
    conversionFactor: faker.helpers.arrayElement([6, 12, 24, 48, 100]),
  }));
  await prisma.productPackage.createMany({ data: derivativePackages });

  console.log('💰 Seeding price lists and scope fixtures...');

  const defaultPriceList = await prisma.priceList.create({
    data: { name: 'Default', currency: CurrencyCode.EUR, isDefault: true },
  });
  const customCurrencies = [CurrencyCode.USD, CurrencyCode.RUB, CurrencyCode.UAH, CurrencyCode.GBP];
  const customPriceLists = await Promise.all(
    customCurrencies.map((currency) =>
      prisma.priceList.create({
        data: { name: `${currency} Price List`, currency },
      }),
    ),
  );

  const assignments = [
    {
      priceListId: customPriceLists[0].id,
      targetType: PriceListTargetType.WAREHOUSE,
      warehouseId: warehouses[0].id,
    },
    {
      priceListId: customPriceLists[1].id,
      targetType: PriceListTargetType.ORGANIZATION,
      organizationId: organizations[0].id,
    },
    {
      priceListId: customPriceLists[2].id,
      targetType: PriceListTargetType.LOCALITY,
      localityId: localities[2].id,
    },
    {
      priceListId: customPriceLists[3].id,
      targetType: PriceListTargetType.COUNTRY,
      countryId: countryByCode.get('UA')!.id,
    },
  ];
  await prisma.priceListAssignment.createMany({ data: assignments });

  const basePackages = await prisma.productPackage.findMany({
    where: { isBase: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const pricesData: { priceListId: number; productPackageId: number; priceAmount: bigint }[] = [];

  basePackages.forEach((productPackage, index) => {
    pricesData.push({
      priceListId: defaultPriceList.id,
      productPackageId: productPackage.id,
      priceAmount: BigInt(10_000 + index * 10),
    });

    if (index < PRICE_FIXTURE_ITEM_COUNT) {
      customPriceLists.forEach((priceList, priceListIndex) => {
        pricesData.push({
          priceListId: priceList.id,
          productPackageId: productPackage.id,
          priceAmount: BigInt((priceListIndex + 2) * 10_000 + index * 10),
        });
      });
    } else if (index % 3 === 0) {
      const priceList = customPriceLists[index % customPriceLists.length];
      pricesData.push({
        priceListId: priceList.id,
        productPackageId: productPackage.id,
        priceAmount: BigInt(20_000 + index * 25),
      });
    }
  });

  for (let batchStart = 0; batchStart < pricesData.length; batchStart += BATCH_SIZE) {
    await prisma.productPrice.createMany({
      data: pricesData.slice(batchStart, batchStart + BATCH_SIZE),
    });
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

  allItemIds.forEach((productItemId, itemIndex) => {
    warehouses.forEach((warehouse) => {
      const hasShipment =
        itemIndex < PRICE_FIXTURE_ITEM_COUNT ||
        faker.datatype.boolean({ probability: SHIPMENT_RATIO });
      if (!hasShipment) return;

      shipmentsData.push({
        warehouseId: warehouse.id,
        productItemId,
        arrivalDate: faker.date.past({ years: 1 }),
        expiryDate: faker.datatype.boolean({ probability: 0.3 })
          ? faker.date.future({ years: 2 })
          : null,
        quantity: faker.number.float({ min: 1, max: 500, fractionDigits: 2 }),
        priceAmount: BigInt(faker.number.int({ min: 100, max: 50_000 })),
        currency: faker.helpers.arrayElement([
          CurrencyCode.EUR,
          CurrencyCode.USD,
          CurrencyCode.RUB,
        ]),
      });
    });
  });

  for (let batchStart = 0; batchStart < shipmentsData.length; batchStart += BATCH_SIZE) {
    await prisma.productShipment.createMany({
      data: shipmentsData.slice(batchStart, batchStart + BATCH_SIZE),
    });
  }

  console.log('✅ Dev seed complete!');
  console.log(`   ${organizations.length} organizations`);
  console.log(`   ${warehouses.length} warehouses`);
  console.log(`   ${collections.length} collections in ${folderIds.length} folders`);
  console.log(`   ${allItemIds.length} items and barcodes`);
  console.log(`   ${basePackages.length} base packages`);
  console.log(`   ${derivativePackages.length} derivative packages`);
  console.log(`   ${customPriceLists.length + 1} price lists`);
  console.log(`   ${assignments.length} scope assignments`);
  console.log(`   ${pricesData.length} prices`);
  console.log(`   ${shipmentsData.length} shipments`);
  console.log(`   ${employeeIdsToReassign.length} employees reassigned`);
  console.log(
    '   Price scopes: DEV-WH-01 warehouse, 02 organization, 03 locality, 04 country, 05-06 default',
  );
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
