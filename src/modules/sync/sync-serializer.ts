import { Prisma } from '@prisma/client';

export function serializeSyncEntity<T = unknown>(entity: T): T {
  return serializeSyncValue(entity) as T;
}
export function serializeSyncItems<T = unknown>(items: T[]): T[] {
  return items.map((item) => serializeSyncEntity(item));
}

function serializeSyncValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializeSyncValue);

  if (value && typeof value === 'object') {
    // Prisma minifies the Decimal constructor name in generated clients, so
    // checking `constructor.name === "Decimal"` is not reliable.
    if (Prisma.Decimal.isDecimal(value)) return value.toString();

    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      result[key] = serializeSyncValue(nestedValue);
    }
    return result;
  }

  return value;
}
