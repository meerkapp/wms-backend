import { z } from 'zod'
import { ProductPackageModelSchema } from '../../generated/schemas/variants/pure/ProductPackage.pure'

export const ProductPackageSchema = ProductPackageModelSchema
  .omit({ productItem: true })
  .extend({ updatedAt: z.string() })

export type ProductPackage = z.infer<typeof ProductPackageSchema>
