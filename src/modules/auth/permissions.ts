export const ALL_PERMISSIONS = [
  'organization:create',
  'organization:update',
  'warehouse:create',
  'warehouse:update',
  'locality:create',
  // employee management
  'employee:create',
  'employee:update',
  'employee:update:email',
  'employee:update:password',
  'employee:deactivate',
  'employee:assign:role',
  'employee:assign:warehouse',
  // own profile
  'employee:update:own:email',
  'employee:update:own:password',
  'employee:update:own:avatar',
  // role management
  'role:create',
  'role:update',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];
