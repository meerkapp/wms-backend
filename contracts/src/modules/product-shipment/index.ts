import { z } from 'zod'
import { ProductShipmentModelSchema } from '../../generated/schemas/variants/pure/ProductShipment.pure'

export const ProductShipmentSchema = ProductShipmentModelSchema
  .omit({ warehouse: true, productItem: true })
  .extend({
    arrivalDate: z.string(),
    expiryDate: z.string().nullable(),
    updatedAt: z.string(),
  })

export type ProductShipment = z.infer<typeof ProductShipmentSchema>
