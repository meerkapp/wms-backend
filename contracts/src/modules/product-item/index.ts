import { z } from 'zod'
import { ProductItemModelSchema } from '../../generated/schemas/variants/pure/ProductItem.pure'

export const ProductItemSchema = ProductItemModelSchema
  .omit({
    productCollection: true,
    productType: true,
    productBrand: true,
    productMeasure: true,
    country: true,
    barcodes: true,
    packages: true,
    shipments: true,
  })
  .extend({ updatedAt: z.string() })

export type ProductItem = z.infer<typeof ProductItemSchema>
