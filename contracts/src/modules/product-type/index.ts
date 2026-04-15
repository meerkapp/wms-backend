import { z } from 'zod'

// --- Characteristics Scheme ---

const NumberCharacteristicSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.literal('number'),
  required: z.boolean().default(false),
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
  options: z.array(SelectOptionSchema).min(1),
})

export const CharacteristicSchema = z.discriminatedUnion('type', [
  NumberCharacteristicSchema,
  SelectCharacteristicSchema,
])

export const CharacteristicsSchemeSchema = z.array(CharacteristicSchema)

export type Characteristic = z.infer<typeof CharacteristicSchema>
export type CharacteristicsScheme = z.infer<typeof CharacteristicsSchemeSchema>

// --- SKU Template ---
// Supported variables:
//   {brand}    — full brand name (uppercased, no spaces)
//   {brand:N}  — first N characters of brand
//   {key}      — full value of a required characteristic
//   {key:N}    — first N characters of the characteristic value
//   {counter}  — numeric counter (optional), starts at 1
// Arbitrary text between variables is allowed: PREFIX-{brand}-{counter}
// On collision a suffix is appended: -1, -2, etc.
// If {brand} is in the template, brand is required when creating a product

const SKU_TEMPLATE_REGEX =
  /^(\{(brand|counter)(?::\d+)?\}|\{[a-z_]+(?::\d+)?\}|[^{}]+)+$/

const RESERVED_SKU_KEYS = new Set(['brand', 'counter'])

function validateSkuTemplate(data: {
  skuMode?: string
  skuTemplate?: string | null
  characteristicsScheme?: CharacteristicsScheme | null
}): boolean {
  if (data.skuMode !== 'CUSTOM' || !data.skuTemplate || !data.characteristicsScheme) return true
  const requiredKeys = new Set(
    data.characteristicsScheme.filter((c) => c.required).map((c) => c.key),
  )
  const templateKeys = [...data.skuTemplate.matchAll(/\{([a-z_]+)(?::\d+)?\}/g)]
    .map(([, key]) => key)
    .filter((key) => !RESERVED_SKU_KEYS.has(key))
  return templateKeys.every((key) => requiredKeys.has(key))
}

// --- Schemas ---

const ProductTypeBaseSchema = z.object({
  name: z.string().min(1),
  defaultWriteoffStrategy: z.enum(['FIFO', 'LIFO', 'FEFO', 'MANUAL']).default('FIFO'),
  skuMode: z.enum(['GLOBAL', 'CUSTOM']).default('GLOBAL'),
  skuTemplate: z.string().regex(SKU_TEMPLATE_REGEX, 'Invalid SKU template format').optional().nullable(),
  characteristicsScheme: CharacteristicsSchemeSchema.optional().nullable(),
})

export const CreateProductTypeSchema = ProductTypeBaseSchema
  .refine(
    (data) => !(data.skuMode === 'CUSTOM' && !data.skuTemplate),
    { message: 'skuTemplate is required for CUSTOM sku mode', path: ['skuTemplate'] },
  )
  .refine(validateSkuTemplate, {
    message: 'All characteristic keys in skuTemplate must be required characteristics',
    path: ['skuTemplate'],
  })

export const UpdateProductTypeSchema = ProductTypeBaseSchema.partial()
  .refine(
    (data) => !(data.skuMode === 'CUSTOM' && data.skuTemplate === null),
    { message: 'skuTemplate cannot be null for CUSTOM sku mode', path: ['skuTemplate'] },
  )
  .refine(validateSkuTemplate, {
    message: 'All characteristic keys in skuTemplate must be required characteristics',
    path: ['skuTemplate'],
  })

export const ProductTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
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
