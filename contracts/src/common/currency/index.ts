import type { CurrencyCode } from '../../generated/schemas/enums/CurrencyCode.schema';

export { CurrencyCodeSchema } from '../../generated/schemas/enums/CurrencyCode.schema';
export type { CurrencyCode } from '../../generated/schemas/enums/CurrencyCode.schema';

export type CurrencyMinorUnits = 0 | 2 | 3;

const MINOR_UNIT_OVERRIDES: Partial<Record<CurrencyCode, CurrencyMinorUnits>> = {
  BHD: 3,
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  IQD: 3,
  ISK: 0,
  JOD: 3,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  PYG: 0,
  RWF: 0,
  TND: 3,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
};

/** Returns the ISO 4217 exponent used to store an amount in minor units. */
export function getCurrencyMinorUnits(currency: CurrencyCode): CurrencyMinorUnits {
  return MINOR_UNIT_OVERRIDES[currency] ?? 2;
}
