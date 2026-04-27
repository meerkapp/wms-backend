import { z } from 'zod'
import { ProductBarcodeModelSchema } from '../../generated/schemas/variants/pure/ProductBarcode.pure'

export const ProductBarcodeSchema = ProductBarcodeModelSchema
  .omit({ productItem: true })
  .extend({ updatedAt: z.string() })

export type ProductBarcode = z.infer<typeof ProductBarcodeSchema>
