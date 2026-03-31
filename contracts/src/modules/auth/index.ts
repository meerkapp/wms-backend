import { z } from 'zod'

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
] as const

export type Permission = (typeof ALL_PERMISSIONS)[number]

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const SetupInitSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
})

export type LoginDto = z.infer<typeof LoginSchema>
export type SetupInitDto = z.infer<typeof SetupInitSchema>

export interface AuthTokens {
  access_token: string
  refresh_token?: string
}

export interface JwtPayload {
  sub: string
  email: string
  firstName: string
  lastName: string
  warehouseId: number | null
  isActive: boolean
  permissions: Permission[]
  lastSeen: string | null
}

export interface SetupStatusResponse {
  isInitialized: boolean
}
