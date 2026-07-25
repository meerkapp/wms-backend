import {
  SKU_MAX_LENGTH,
  SKU_VALUE_REGEX,
  type CharacteristicsScheme,
} from '@meerkapp/wms-contracts';

const SKU_TOKEN_REGEX = /\{([a-z][a-z0-9_]*)(?::(\d+))?\}/g;
const DEFAULT_SEQUENTIAL_WIDTH = 8;

export class ProductSkuError extends Error {}

export function validateProductCharacteristics(
  scheme: CharacteristicsScheme | null,
  values: Record<string, unknown>,
): void {
  const definitions = new Map((scheme ?? []).map((definition) => [definition.key, definition]));

  for (const key of Object.keys(values)) {
    if (!definitions.has(key)) {
      throw new ProductSkuError(`Unknown product characteristic: ${key}`);
    }
  }

  for (const definition of scheme ?? []) {
    const value = values[definition.key];
    const isAbsent = value === undefined || value === null;

    if ('required' in definition && definition.required && (isAbsent || value === '')) {
      throw new ProductSkuError(`Product characteristic ${definition.key} is required`);
    }
    if (isAbsent) continue;

    switch (definition.type) {
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new ProductSkuError(`Product characteristic ${definition.key} must be a number`);
        }
        if (definition.validation?.min !== undefined && value < definition.validation.min) {
          throw new ProductSkuError(
            `Product characteristic ${definition.key} must be at least ${definition.validation.min}`,
          );
        }
        if (definition.validation?.max !== undefined && value > definition.validation.max) {
          throw new ProductSkuError(
            `Product characteristic ${definition.key} must be at most ${definition.validation.max}`,
          );
        }
        break;
      case 'select':
        if (
          typeof value !== 'string' ||
          !definition.options.some((option) => option.value === value)
        ) {
          throw new ProductSkuError(
            `Product characteristic ${definition.key} has an invalid option`,
          );
        }
        break;
      case 'toggle':
      case 'checkbox':
        if (typeof value !== 'boolean') {
          throw new ProductSkuError(`Product characteristic ${definition.key} must be a boolean`);
        }
        break;
    }
  }
}

export function renderSequentialSku(sequence: bigint): string {
  return validateFinalSku(sequence.toString().padStart(DEFAULT_SEQUENTIAL_WIDTH, '0'));
}

export function renderTemplateSku(
  template: string,
  scheme: CharacteristicsScheme | null,
  characteristics: Record<string, unknown>,
  sequence: bigint | null,
): string {
  const definitions = new Map((scheme ?? []).map((definition) => [definition.key, definition]));

  const rendered = template.replace(SKU_TOKEN_REGEX, (_token, key: string, length?: string) => {
    const requestedLength = length === undefined ? null : Number(length);
    if (key === 'seq') {
      if (sequence === null) throw new ProductSkuError('SKU sequence was not allocated');
      const value = sequence.toString();
      return requestedLength === null ? value : value.padStart(requestedLength, '0');
    }

    const definition = definitions.get(key);
    if (!definition) throw new ProductSkuError(`Unknown SKU template token: ${key}`);
    const value = characteristics[key];
    const component = renderCharacteristicValue(definition.type, value);
    return requestedLength === null ? component : component.slice(0, requestedLength);
  });

  return validateFinalSku(rendered.toUpperCase());
}

export function normalizeManualSku(value: string): string {
  return validateFinalSku(value.trim().toUpperCase());
}

export function templateUsesSequence(template: string): boolean {
  return /\{seq(?::\d+)?\}/.test(template);
}

function renderCharacteristicValue(
  type: CharacteristicsScheme[number]['type'],
  value: unknown,
): string {
  switch (type) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new ProductSkuError('Invalid numeric SKU component');
      }
      return Object.is(value, -0) ? '0' : value.toString();
    case 'select':
      if (typeof value !== 'string') throw new ProductSkuError('Invalid select SKU component');
      return value.toUpperCase();
    case 'toggle':
      if (typeof value !== 'boolean') throw new ProductSkuError('Invalid toggle SKU component');
      return value ? '1' : '0';
    case 'checkbox':
      throw new ProductSkuError('Checkbox characteristics cannot be used in SKU templates');
  }
}

function validateFinalSku(value: string): string {
  if (value.length === 0) throw new ProductSkuError('SKU cannot be empty');
  if (value.length > SKU_MAX_LENGTH) {
    throw new ProductSkuError(`SKU cannot exceed ${SKU_MAX_LENGTH} characters`);
  }
  if (!SKU_VALUE_REGEX.test(value)) {
    throw new ProductSkuError(
      'SKU must contain only uppercase letters, numbers, dots, dashes and underscores',
    );
  }
  return value;
}
