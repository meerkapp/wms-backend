import { z } from 'zod';

// --- Characteristic types ---

export const CHARACTERISTIC_KEY_REGEX = /^[a-z][a-z0-9_]*$/;
const RESERVED_SKU_KEYS = new Set(['seq']);

const CharacteristicKeySchema = z
  .string()
  .min(1)
  .regex(
    CHARACTERISTIC_KEY_REGEX,
    'Characteristic key must start with a lowercase letter and contain only lowercase letters, numbers and underscores',
  )
  .refine((key) => !RESERVED_SKU_KEYS.has(key), 'Characteristic key is reserved');

const NumberCharacteristicSchema = z.object({
  key: CharacteristicKeySchema,
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
});

const SelectOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

const SelectCharacteristicSchema = z.object({
  key: CharacteristicKeySchema,
  label: z.string().min(1),
  type: z.literal('select'),
  required: z.boolean().default(false),
  options: z.array(SelectOptionSchema).min(1),
});

// Toggle values are rendered as 1 and 0 in SKU templates. Labels remain UI-only.
const ToggleCharacteristicSchema = z.object({
  key: CharacteristicKeySchema,
  label: z.string().min(1),
  type: z.literal('toggle'),
  required: z.boolean().default(false),
  true_label: z.string().min(1),
  false_label: z.string().min(1),
});

// Simple boolean flag — present or not. Cannot be used in SKU templates.
const CheckboxCharacteristicSchema = z.object({
  key: CharacteristicKeySchema,
  label: z.string().min(1),
  type: z.literal('checkbox'),
});

export const CharacteristicSchema = z.discriminatedUnion('type', [
  NumberCharacteristicSchema,
  SelectCharacteristicSchema,
  ToggleCharacteristicSchema,
  CheckboxCharacteristicSchema,
]);

export const CharacteristicsSchemeSchema = z
  .array(CharacteristicSchema)
  .superRefine((scheme, ctx) => {
    const keys = new Set<string>();
    scheme.forEach((characteristic, index) => {
      if (keys.has(characteristic.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate characteristic key: ${characteristic.key}`,
          path: [index, 'key'],
        });
      }
      keys.add(characteristic.key);

      if (
        characteristic.type === 'number' &&
        characteristic.validation?.min !== undefined &&
        characteristic.validation.max !== undefined &&
        characteristic.validation.min > characteristic.validation.max
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Characteristic minimum cannot exceed maximum',
          path: [index, 'validation', 'max'],
        });
      }
    });
  });

export type Characteristic = z.infer<typeof CharacteristicSchema>;
export type CharacteristicsScheme = z.infer<typeof CharacteristicsSchemeSchema>;

// --- SKU templates ---
//
//   {key}    — full value of a required number/select/toggle characteristic
//   {key:N}  — first N characters of that value
//   {seq}    — global auto-incrementing number
//   {seq:N}  — the same number padded with zeroes to at least N characters
//
// Static text may contain ASCII letters, numbers, dots, dashes and underscores.

export const SKU_MAX_LENGTH = 64;
export const SKU_TEMPLATE_MAX_LENGTH = 128;
export const SKU_TOKEN_MAX_LENGTH = 18;
export const SKU_VALUE_REGEX = /^[A-Z0-9._-]+$/;
export const SKU_INPUT_REGEX = /^[A-Za-z0-9._-]+$/;
export const SKU_TEMPLATE_REGEX = /^(\{(seq|[a-z][a-z0-9_]*)(?::[1-9]\d?)?\}|[A-Za-z0-9._-]+)+$/;

const SKU_COMPATIBLE_TYPES = new Set(['number', 'select', 'toggle']);
const SKU_TOKEN_REGEX = /\{([a-z][a-z0-9_]*)(?::(\d+))?\}/g;

const ProductTypeFieldsSchema = z.object({
  name: z.string().min(1),
  defaultWriteoffStrategy: z.enum(['FIFO', 'LIFO', 'FEFO', 'MANUAL']).default('FIFO'),
  skuMode: z.enum(['SEQUENTIAL', 'TEMPLATE', 'MANUAL']).default('SEQUENTIAL'),
  skuTemplate: z
    .string()
    .min(1)
    .max(SKU_TEMPLATE_MAX_LENGTH)
    .regex(SKU_TEMPLATE_REGEX, 'Invalid SKU template format')
    .optional()
    .nullable(),
  characteristicsScheme: CharacteristicsSchemeSchema.optional().nullable(),
});

export const ProductTypeConfigurationSchema = ProductTypeFieldsSchema.superRefine((data, ctx) => {
  if (data.skuMode !== 'TEMPLATE') {
    if (data.skuTemplate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'skuTemplate is only allowed for TEMPLATE sku mode',
        path: ['skuTemplate'],
      });
    }
    return;
  }

  if (!data.skuTemplate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'skuTemplate is required for TEMPLATE sku mode',
      path: ['skuTemplate'],
    });
    return;
  }

  if (!SKU_TEMPLATE_REGEX.test(data.skuTemplate)) return;

  const characteristicsByKey = new Map(
    (data.characteristicsScheme ?? []).map((characteristic, index) => [
      characteristic.key,
      { characteristic, index },
    ]),
  );

  for (const match of data.skuTemplate.matchAll(SKU_TOKEN_REGEX)) {
    const [, key, length] = match;
    if (length !== undefined && Number(length) > SKU_TOKEN_MAX_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SKU token length cannot exceed ${SKU_TOKEN_MAX_LENGTH}`,
        path: ['skuTemplate'],
      });
    }

    if (key === 'seq') continue;

    const entry = characteristicsByKey.get(key);
    const characteristic = entry?.characteristic;
    if (
      !characteristic ||
      !SKU_COMPATIBLE_TYPES.has(characteristic.type) ||
      !('required' in characteristic) ||
      !characteristic.required
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SKU token ${key} must reference a required number, select or toggle characteristic`,
        path: ['skuTemplate'],
      });
      continue;
    }

    if (characteristic.type === 'select') {
      characteristic.options.forEach((option, optionIndex) => {
        if (!SKU_INPUT_REGEX.test(option.value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'An option used in a SKU template must contain only letters, numbers, dots, dashes and underscores',
            path: ['characteristicsScheme', entry.index, 'options', optionIndex, 'value'],
          });
        }
      });
    }
  }

  if (minimumRenderedSkuLength(data.skuTemplate) > SKU_MAX_LENGTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `SKU template cannot produce a value within ${SKU_MAX_LENGTH} characters`,
      path: ['skuTemplate'],
    });
  }
});

export const CreateProductTypeSchema = ProductTypeConfigurationSchema;

// Cross-field SKU validation is performed after merging this patch with the
// stored ProductType configuration.
export const UpdateProductTypeSchema = ProductTypeFieldsSchema.partial();

export const ProductTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
  defaultWriteoffStrategy: z.enum(['FIFO', 'LIFO', 'FEFO', 'MANUAL']),
  skuMode: z.enum(['SEQUENTIAL', 'TEMPLATE', 'MANUAL']),
  skuTemplate: z.string().nullable(),
  characteristicsScheme: CharacteristicsSchemeSchema.nullable(),
  updatedAt: z.string(),
});

export type ProductType = z.infer<typeof ProductTypeSchema>;
export type CreateProductTypeDto = z.infer<typeof CreateProductTypeSchema>;
export type UpdateProductTypeDto = z.infer<typeof UpdateProductTypeSchema>;

function minimumRenderedSkuLength(template: string): number {
  let length = 0;
  let cursor = 0;

  for (const match of template.matchAll(SKU_TOKEN_REGEX)) {
    const index = match.index ?? cursor;
    length += index - cursor;
    length += match[1] === 'seq' && match[2] !== undefined ? Number(match[2]) : 1;
    cursor = index + match[0].length;
  }

  return length + template.length - cursor;
}
