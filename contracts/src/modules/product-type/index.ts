import { z } from 'zod'

const NumberCharacteristicSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.literal('number'),
  required: z.boolean().default(false),
  sku_dependent: z.boolean().default(false),
  validation: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
  ui: z
    .object({
      suffix: z.string().optional(),
    })
    .optional(),
})

const SelectOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
})

const SelectCharacteristicSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.literal('select'),
  required: z.boolean().default(false),
  sku_dependent: z.boolean().default(false),
  options: z.array(SelectOptionSchema).min(1),
})

export const CharacteristicSchema = z.discriminatedUnion('type', [
  NumberCharacteristicSchema,
  SelectCharacteristicSchema,
])

export const CharacteristicsSchemeSchema = z.array(CharacteristicSchema)

export type Characteristic = z.infer<typeof CharacteristicSchema>
export type CharacteristicsScheme = z.infer<typeof CharacteristicsSchemeSchema>

const SKU_TEMPLATE_REGEX =
  /^(\{(brand|type|counter)(?::\d+)?\}|\{[a-z_]+(?::\d+)?\}|[^{}]+)+$/

const ProductTypeBaseSchema = z.object({
  name: z.string().min(1),
  code: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-ZА-ЯЁ0-9]+$/, 'Code must be uppercase letters and digits'),
  defaultWriteoffStrategy: z.enum(['FIFO', 'LIFO', 'FEFO', 'MANUAL']).default('FIFO'),
  skuMode: z.enum(['GLOBAL', 'CUSTOM']).default('GLOBAL'),
  skuTemplate: z.string().regex(SKU_TEMPLATE_REGEX).optional().nullable(),
  characteristicsScheme: CharacteristicsSchemeSchema.optional().nullable(),
})

function refineCustomSkuTemplate<T extends { skuMode?: string; skuTemplate?: string | null; characteristicsScheme?: CharacteristicsScheme | null }>(
  data: T,
): boolean {
  if (data.skuMode !== 'CUSTOM' || !data.skuTemplate || !data.characteristicsScheme) return true
  const schemeKeys = new Set(data.characteristicsScheme.map((c) => c.key))
  const templateKeys = [...data.skuTemplate.matchAll(/\{([a-z_]+)(?::\d+)?\}/g)]
    .map(([, key]) => key)
    .filter((key) => !['brand', 'type', 'counter'].includes(key))
  return templateKeys.every((key) => schemeKeys.has(key))
}

export const CreateProductTypeSchema = ProductTypeBaseSchema.refine(
  (data) => !(data.skuMode === 'CUSTOM' && !data.skuTemplate),
  { message: 'skuTemplate is required for CUSTOM sku mode', path: ['skuTemplate'] },
).refine(refineCustomSkuTemplate, {
  message: 'All characteristic keys in skuTemplate must exist in characteristicsScheme',
  path: ['skuTemplate'],
})

export const UpdateProductTypeSchema = ProductTypeBaseSchema.partial()
  .refine(
    (data) => !(data.skuMode === 'CUSTOM' && data.skuTemplate === null),
    { message: 'skuTemplate cannot be null for CUSTOM sku mode', path: ['skuTemplate'] },
  )
  .refine(refineCustomSkuTemplate, {
    message: 'All characteristic keys in skuTemplate must exist in characteristicsScheme',
    path: ['skuTemplate'],
  })

export const ProductTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  defaultWriteoffStrategy: z.enum(['FIFO', 'LIFO', 'FEFO', 'MANUAL']),
  skuMode: z.enum(['GLOBAL', 'CUSTOM']),
  skuTemplate: z.string().nullable(),
  skuCounter: z.number(),
  characteristicsScheme: CharacteristicsSchemeSchema.nullable(),
  updatedAt: z.string(),
})

export type ProductType = z.infer<typeof ProductTypeSchema>
export type CreateProductTypeDto = z.infer<typeof CreateProductTypeSchema>
export type UpdateProductTypeDto = z.infer<typeof UpdateProductTypeSchema>
