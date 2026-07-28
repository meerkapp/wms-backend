import { z } from 'zod';

export const ACCESS_SCOPE_TYPES = ['GLOBAL', 'WAREHOUSE'] as const;
export const AccessScopeTypeSchema = z.enum(ACCESS_SCOPE_TYPES);
export type AccessScopeType = z.infer<typeof AccessScopeTypeSchema>;

export const AccessScopeCoverageSchema = z.object({
  global: z.boolean(),
  warehouseIds: z.array(z.number().int().positive()),
});
export type AccessScopeCoverage = z.infer<typeof AccessScopeCoverageSchema>;

export const ALL_PERMISSIONS = [
  'organization:create',
  'organization:update',
  'warehouse:create',
  'warehouse:update',
  'locality:create',
  // employee management
  'employee:create',
  'employee:update:info',
  'employee:update:warehouse',
  'employee:update:roles',
  'employee:update:email',
  'employee:update:password',
  'employee:toggle:active',
  'employee:update:avatar',
  // own profile
  'employee:update:own:info',
  'employee:update:own:email',
  'employee:update:own:password',
  'employee:update:own:avatar',
  // role management
  'role:create',
  'role:update',
  // product type management
  'product_type:create',
  'product_type:update',
  // product item lifecycle
  'product_item:create',
  'product_item:archive',
  // folder management
  'folder:create',
  'folder:update',
  'folder:delete',
  'folder:pin',
  // product collection management
  'product_collection:create',
  'product_collection:update',
  'product_collection:delete',
  'product_collection:pin',
  // price list management
  'price_list:create',
  'price_list:update',
] as const;

export const PermissionSchema = z.enum(ALL_PERMISSIONS);
export type Permission = (typeof ALL_PERMISSIONS)[number];

export const PERMISSION_SCOPE_POLICY_TYPES = ['RESOURCE_SCOPED', 'SYSTEM_WIDE', 'SELF'] as const;
export const PermissionScopePolicySchema = z.enum(PERMISSION_SCOPE_POLICY_TYPES);
export type PermissionScopePolicy = z.infer<typeof PermissionScopePolicySchema>;

export const PERMISSION_SCOPE_POLICIES = {
  'organization:create': 'SYSTEM_WIDE',
  'organization:update': 'SYSTEM_WIDE',
  'warehouse:create': 'SYSTEM_WIDE',
  'warehouse:update': 'SYSTEM_WIDE',
  'locality:create': 'SYSTEM_WIDE',
  'employee:create': 'RESOURCE_SCOPED',
  'employee:update:info': 'RESOURCE_SCOPED',
  'employee:update:warehouse': 'RESOURCE_SCOPED',
  'employee:update:roles': 'RESOURCE_SCOPED',
  'employee:update:email': 'RESOURCE_SCOPED',
  'employee:update:password': 'RESOURCE_SCOPED',
  'employee:toggle:active': 'RESOURCE_SCOPED',
  'employee:update:avatar': 'RESOURCE_SCOPED',
  'employee:update:own:info': 'SELF',
  'employee:update:own:email': 'SELF',
  'employee:update:own:password': 'SELF',
  'employee:update:own:avatar': 'SELF',
  'role:create': 'SYSTEM_WIDE',
  'role:update': 'SYSTEM_WIDE',
  'product_type:create': 'SYSTEM_WIDE',
  'product_type:update': 'SYSTEM_WIDE',
  'product_item:create': 'SYSTEM_WIDE',
  'product_item:archive': 'SYSTEM_WIDE',
  'folder:create': 'SYSTEM_WIDE',
  'folder:update': 'SYSTEM_WIDE',
  'folder:delete': 'SYSTEM_WIDE',
  'folder:pin': 'SYSTEM_WIDE',
  'product_collection:create': 'SYSTEM_WIDE',
  'product_collection:update': 'SYSTEM_WIDE',
  'product_collection:delete': 'SYSTEM_WIDE',
  'product_collection:pin': 'SYSTEM_WIDE',
  'price_list:create': 'SYSTEM_WIDE',
  'price_list:update': 'SYSTEM_WIDE',
} as const satisfies Record<Permission, PermissionScopePolicy>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const SetupInitSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export type LoginDto = z.infer<typeof LoginSchema>;
export type SetupInitDto = z.infer<typeof SetupInitSchema>;

export interface AuthTokens {
  access_token: string;
  refresh_token?: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  warehouseId: number | null;
  isActive: boolean;
  permissions: Permission[];
  lastSeen: string | null;
}

export interface SetupStatusResponse {
  isInitialized: boolean;
}
