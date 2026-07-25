import { ProductTypeConfigurationSchema } from '@meerkapp/wms-contracts';
import {
  normalizeManualSku,
  ProductSkuError,
  renderSequentialSku,
  renderTemplateSku,
  templateUsesSequence,
  validateProductCharacteristics,
} from './product-sku';

const scheme = [
  {
    key: 'color',
    label: 'Color',
    type: 'select' as const,
    required: true,
    options: [
      { label: 'Red', value: 'RED' },
      { label: 'Blue', value: 'BLUE' },
    ],
  },
  {
    key: 'size',
    label: 'Size',
    type: 'number' as const,
    required: true,
    validation: { min: 1, max: 100 },
  },
  {
    key: 'rechargeable',
    label: 'Rechargeable',
    type: 'toggle' as const,
    required: true,
    true_label: 'Yes',
    false_label: 'No',
  },
];

describe('product SKU', () => {
  it('renders sequential and templated SKUs deterministically', () => {
    expect(renderSequentialSku(42n)).toBe('00000042');
    expect(
      renderTemplateSku(
        'shoe-{color:2}-{size}-{rechargeable}-{seq:6}',
        scheme,
        { color: 'RED', size: 42, rechargeable: true },
        17n,
      ),
    ).toBe('SHOE-RE-42-1-000017');
    expect(templateUsesSequence('{color}-{seq:6}')).toBe(true);
    expect(templateUsesSequence('{color}')).toBe(false);
  });

  it('normalizes a manual SKU without inventing replacement characters', () => {
    expect(normalizeManualSku(' legacy-1 ')).toBe('LEGACY-1');
    expect(() => normalizeManualSku('артикул 1')).toThrow(ProductSkuError);
  });

  it('validates required, unknown and typed product characteristics', () => {
    expect(() =>
      validateProductCharacteristics(scheme, {
        color: 'RED',
        size: 42,
        rechargeable: false,
      }),
    ).not.toThrow();
    expect(() =>
      validateProductCharacteristics(scheme, {
        color: 'GREEN',
        size: 42,
        rechargeable: false,
      }),
    ).toThrow('Product characteristic color has an invalid option');
    expect(() =>
      validateProductCharacteristics(scheme, {
        color: 'RED',
        size: 42,
        rechargeable: false,
        unknown: true,
      }),
    ).toThrow('Unknown product characteristic: unknown');
    expect(() =>
      validateProductCharacteristics(scheme, { color: 'RED', rechargeable: false }),
    ).toThrow('Product characteristic size is required');
    expect(() =>
      validateProductCharacteristics(
        [
          {
            key: 'material',
            label: 'Material',
            type: 'select',
            required: false,
            options: [{ label: 'Cotton', value: 'COTTON' }],
          },
        ],
        { material: '' },
      ),
    ).toThrow('Product characteristic material has an invalid option');
  });

  it('rejects brand tokens, duplicate keys and invalid template dependencies', () => {
    expect(
      ProductTypeConfigurationSchema.safeParse({
        name: 'Shoes',
        skuMode: 'TEMPLATE',
        skuTemplate: '{brand}-{seq}',
        characteristicsScheme: scheme,
      }).success,
    ).toBe(false);
    expect(
      ProductTypeConfigurationSchema.safeParse({
        name: 'Shoes',
        skuMode: 'TEMPLATE',
        skuTemplate: '{color}-{seq}',
        characteristicsScheme: [scheme[0], scheme[0]],
      }).success,
    ).toBe(false);
    expect(
      ProductTypeConfigurationSchema.safeParse({
        name: 'Shoes',
        skuMode: 'TEMPLATE',
        skuTemplate: '{unknown}-{seq}',
        characteristicsScheme: scheme,
      }).success,
    ).toBe(false);
  });

  it('only restricts select values when the characteristic is part of the SKU', () => {
    const descriptiveScheme = [
      {
        key: 'material',
        label: 'Material',
        type: 'select' as const,
        required: true,
        options: [{ label: 'Cotton blend', value: 'Cotton blend' }],
      },
    ];

    expect(
      ProductTypeConfigurationSchema.safeParse({
        name: 'Sequential clothing',
        skuMode: 'SEQUENTIAL',
        characteristicsScheme: descriptiveScheme,
      }).success,
    ).toBe(true);
    expect(
      ProductTypeConfigurationSchema.safeParse({
        name: 'Templated clothing',
        skuMode: 'TEMPLATE',
        skuTemplate: '{material}-{seq}',
        characteristicsScheme: descriptiveScheme,
      }).success,
    ).toBe(false);
  });

  it('rejects impossible characteristic ranges and templates longer than the SKU limit', () => {
    expect(
      ProductTypeConfigurationSchema.safeParse({
        name: 'Invalid range',
        skuMode: 'SEQUENTIAL',
        characteristicsScheme: [
          {
            key: 'size',
            label: 'Size',
            type: 'number',
            required: false,
            validation: { min: 10, max: 5 },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      ProductTypeConfigurationSchema.safeParse({
        name: 'Impossible SKU',
        skuMode: 'TEMPLATE',
        skuTemplate: `${'A'.repeat(64)}-{seq}`,
      }).success,
    ).toBe(false);
  });
});
