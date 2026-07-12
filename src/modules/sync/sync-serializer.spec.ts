import { Prisma } from '@prisma/client';
import { serializeSyncEntity } from './sync-serializer';

describe('serializeSyncEntity', () => {
  it('serializes Prisma Decimal and BigInt values to JSON-safe strings', () => {
    expect(
      serializeSyncEntity({
        quantity: new Prisma.Decimal('12.340'),
        retailPrice: 12345n,
      }),
    ).toEqual({
      quantity: '12.34',
      retailPrice: '12345',
    });
  });
});
