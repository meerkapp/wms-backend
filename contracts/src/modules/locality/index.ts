import { z } from 'zod'
import { LocalityModelSchema } from '../../generated/schemas/variants/pure/Locality.pure'

export const CreateLocalitySchema = z.object({
  name: z.string().min(1),
  countryId: z.number().int().positive(),
})

export const LocalitySchema = LocalityModelSchema
  .omit({ warehouses: true, country: true })
  .extend({ updatedAt: z.string() })

export type CreateLocalityDto = z.infer<typeof CreateLocalitySchema>
export type Locality = z.infer<typeof LocalitySchema>
