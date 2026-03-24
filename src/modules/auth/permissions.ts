export const ALL_PERMISSIONS = [
  'organization:create',
  'organization:update',
  'warehouse:create',
  'warehouse:update',
  'country:create',
  'city:create',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];
