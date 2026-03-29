import { z } from 'zod'
import { CountryModelSchema } from '../../generated/schemas/variants/pure/Country.pure'

export const CountrySchema = CountryModelSchema
  .omit({ localities: true })
  .extend({ updatedAt: z.string(), currency: z.string().nullable() })

export type Country = z.infer<typeof CountrySchema>
