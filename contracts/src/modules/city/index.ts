import { z } from 'zod'
import { CityModelSchema } from '../../generated/schemas/variants/pure/City.pure'

export const CreateCitySchema = z.object({
  name: z.string().min(1),
  countryId: z.number().int().positive(),
})

export const CitySchema = CityModelSchema
  .omit({ warehouses: true, country: true })
  .extend({ updatedAt: z.string() })

export type CreateCityDto = z.infer<typeof CreateCitySchema>
export type City = z.infer<typeof CitySchema>
