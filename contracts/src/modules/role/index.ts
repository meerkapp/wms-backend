import { z } from 'zod'
import { EmployeeRoleModelSchema } from '../../generated/schemas/variants/pure/EmployeeRole.pure'

export const RolePermissionItemSchema = z.object({
  employeePermission: z.object({
    id: z.number(),
    name: z.string(),
  }),
})

export const RoleSchema = EmployeeRoleModelSchema
  .omit({ assignments: true, permissions: true })
  .extend({
    id: z.number(),
    position: z.number().int(),
    updatedAt: z.string(),
    permissions: z.array(RolePermissionItemSchema),
    canManage: z.boolean(),
    canAssign: z.boolean(),
  })

export type Role = z.infer<typeof RoleSchema>

export const CreateRoleSchema = z.object({
  name: z.string().min(1),
  color: z.string(),
  permissionIds: z.array(z.number().int()).refine((ids) => new Set(ids).size === ids.length, {
    message: 'Permission IDs must be unique',
  }).optional(),
})

export const UpdateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  permissionIds: z.array(z.number().int()).refine((ids) => new Set(ids).size === ids.length, {
    message: 'Permission IDs must be unique',
  }).optional(),
})

export const ReorderRolesSchema = z.object({
  roleIds: z.array(z.number().int()).min(1).refine((ids) => new Set(ids).size === ids.length, {
    message: 'Role IDs must be unique',
  }),
})

export type CreateRoleDto = z.infer<typeof CreateRoleSchema>
export type UpdateRoleDto = z.infer<typeof UpdateRoleSchema>
export type ReorderRolesDto = z.infer<typeof ReorderRolesSchema>
