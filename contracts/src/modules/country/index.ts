import { z } from 'zod'
import { CountryModelSchema } from '../../generated/schemas/variants/pure/Country.pure'

export const CreateCountrySchema = z.object({
  code: z.string().length(2),
  name: z.string().min(1).optional().nullable(),
})

export const CountrySchema = CountryModelSchema
  .omit({ localities: true })
  .extend({ updatedAt: z.string() })

export type CreateCountryDto = z.infer<typeof CreateCountrySchema>
export type Country = z.infer<typeof CountrySchema>
