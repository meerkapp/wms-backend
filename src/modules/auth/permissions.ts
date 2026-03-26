export const ALL_PERMISSIONS = [
  'organization:create',
  'organization:update',
  'warehouse:create',
  'warehouse:update',
  'locality:create',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];
