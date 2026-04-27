import { z } from 'zod'
import { ProductBrandModelSchema } from '../../generated/schemas/variants/pure/ProductBrand.pure'

export const ProductBrandSchema = ProductBrandModelSchema
  .omit({ products: true })
  .extend({ updatedAt: z.string() })

export type ProductBrand = z.infer<typeof ProductBrandSchema>
