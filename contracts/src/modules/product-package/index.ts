import { z } from 'zod';
import { ProductPackageModelSchema } from '../../generated/schemas/variants/pure/ProductPackage.pure';

export const ProductPackageSchema = ProductPackageModelSchema.omit({
  productItem: true,
  prices: true,
}).extend({ conversionFactor: z.string(), updatedAt: z.string() });

export type ProductPackage = z.infer<typeof ProductPackageSchema>;
