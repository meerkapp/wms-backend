import { z } from 'zod'

// --- Characteristic types ---

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

// Two-state selector with custom labels for each state.
// e.g. true_label: "Direct", false_label: "Reverse"
// Can be used in SKU template when required: true
const ToggleCharacteristicSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.literal('toggle'),
  required: z.boolean().default(false),
  true_label: z.string().min(1),
  false_label: z.string().min(1),
})

// Simple boolean flag — present or not.
// Cannot be used in SKU template.
const CheckboxCharacteristicSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.literal('checkbox'),
})

export const CharacteristicSchema = z.discriminatedUnion('type', [
  NumberCharacteristicSchema,
  SelectCharacteristicSchema,
  ToggleCharacteristicSchema,
  CheckboxCharacteristicSchema,
])

export const CharacteristicsSchemeSchema = z.array(CharacteristicSchema)

export type Characteristic = z.infer<typeof CharacteristicSchema>
export type CharacteristicsScheme = z.infer<typeof CharacteristicsSchemeSchema>

// SKU template syntax:
//   {brand}    — full brand (uppercased, spaces removed)
//   {brand:N}  — first N chars of brand
//   {key}      — full value of a required number/select/toggle characteristic
//   {key:N}    — first N chars of that value
//   {counter}  — auto-incrementing number, starts at 1 (optional)
// Static text is allowed anywhere: BAT-{brand:3}-{counter}
// Duplicate SKUs get a numeric suffix: -1, -2, …
// Presence of {brand} makes brand required on product creation.

const SKU_TEMPLATE_REGEX =
  /^(\{(brand|counter)(?::\d+)?\}|\{[a-z_]+(?::\d+)?\}|[^{}]+)+$/

const RESERVED_SKU_KEYS = new Set(['brand', 'counter'])

const SKU_COMPATIBLE_TYPES = new Set(['number', 'select', 'toggle'])

function validateSkuTemplate(data: {
  skuMode?: string
  skuTemplate?: string | null
  characteristicsScheme?: CharacteristicsScheme | null
}): boolean {
  if (data.skuMode !== 'CUSTOM' || !data.skuTemplate || !data.characteristicsScheme) return true

  const skuCompatibleKeys = new Set(
    data.characteristicsScheme
      .filter((c) => SKU_COMPATIBLE_TYPES.has(c.type) && 'required' in c && c.required)
      .map((c) => c.key),
  )

  const templateKeys = [...data.skuTemplate.matchAll(/\{([a-z_]+)(?::\d+)?\}/g)]
    .map(([, key]) => key)
    .filter((key) => !RESERVED_SKU_KEYS.has(key))

  return templateKeys.every((key) => skuCompatibleKeys.has(key))
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
    message: 'All keys in skuTemplate must be required characteristics of type number, select or toggle',
    path: ['skuTemplate'],
  })

export const UpdateProductTypeSchema = ProductTypeBaseSchema.partial()
  .refine(
    (data) => !(data.skuMode === 'CUSTOM' && data.skuTemplate === null),
    { message: 'skuTemplate cannot be null for CUSTOM sku mode', path: ['skuTemplate'] },
  )
  .refine(validateSkuTemplate, {
    message: 'All keys in skuTemplate must be required characteristics of type number, select or toggle',
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
