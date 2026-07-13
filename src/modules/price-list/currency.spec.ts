import { getCurrencyMinorUnits } from '@meerkapp/wms-contracts';

describe('getCurrencyMinorUnits', () => {
  it.each([
    ['EUR', 2],
    ['JPY', 0],
    ['KWD', 3],
  ] as const)('returns the minor units for %s', (currency, expected) => {
    expect(getCurrencyMinorUnits(currency)).toBe(expected);
  });
});
