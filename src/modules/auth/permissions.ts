export const ALL_PERMISSIONS = [
  'organization:create',
  'organization:update',
  'warehouse:create',
  'warehouse:update',
  'locality:create',
  'employee:read',
  'employee:create',
  'employee:update',
  'employee:deactivate',
  'employee:assign:role',
  'employee:assign:warehouse',
  'employee:read:own',
  'employee:update:own:email',
  'employee:update:own:password',
  'employee:update:own:avatar',
  'role:read',
  'role:create',
  'role:update',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];
