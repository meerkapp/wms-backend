import { z } from 'zod'
import { ProductMeasureModelSchema } from '../../generated/schemas/variants/pure/ProductMeasure.pure'

export const ProductMeasureSchema = ProductMeasureModelSchema
  .omit({ products: true })
  .extend({ updatedAt: z.string() })

export type ProductMeasure = z.infer<typeof ProductMeasureSchema>
