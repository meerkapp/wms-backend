export const ALL_PERMISSIONS = [
  'organization:create',
  'organization:update',
  'warehouse:create',
  'warehouse:update',
  'country:create',
  'locality:create',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];
