import { Prisma } from '@prisma/client';

export const PUBLIC_PRODUCT_ITEM_SELECT = {
  id: true,
  sku: true,
  name: true,
  productCollectionId: true,
  productTypeId: true,
  productBrandId: true,
  productMeasureId: true,
  countryId: true,
  characteristics: true,
  writeoffStrategy: true,
  isPublic: true,
  archivedAt: true,
  archivedByEmployeeId: true,
  updatedAt: true,
  productBrand: true,
  productMeasure: true,
} satisfies Prisma.ProductItemSelect;

export type PublicProductItemRow = Prisma.ProductItemGetPayload<{
  select: typeof PUBLIC_PRODUCT_ITEM_SELECT;
}>;
