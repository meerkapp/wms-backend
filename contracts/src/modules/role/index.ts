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
    updatedAt: z.string(),
    permissions: z.array(RolePermissionItemSchema),
  })

export type Role = z.infer<typeof RoleSchema>

export const CreateRoleSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  permissionIds: z.array(z.number().int()).optional(),
})

export const UpdateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  permissionIds: z.array(z.number().int()).optional(),
})

export type CreateRoleDto = z.infer<typeof CreateRoleSchema>
export type UpdateRoleDto = z.infer<typeof UpdateRoleSchema>
