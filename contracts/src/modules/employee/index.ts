import { z } from 'zod'
import { EmployeeModelSchema } from '../../generated/schemas/variants/pure/Employee.pure'
import { EmployeeRoleModelSchema } from '../../generated/schemas/variants/pure/EmployeeRole.pure'

export const EmployeeRoleSchema = EmployeeRoleModelSchema
  .omit({ assignments: true, permissions: true })
  .extend({ id: z.number(), updatedAt: z.string() })

export const EmployeeSchema = EmployeeModelSchema
  .omit({ password: true, warehouse: true, roleAssignments: true })
  .extend({
    phone: z.string().nullable(),
    lastSeen: z.string().nullable(),
    updatedAt: z.string(),
    roleAssignments: z.array(
      z.object({
        employeeRole: EmployeeRoleSchema,
      }),
    ),
  })

export type EmployeeRole = z.infer<typeof EmployeeRoleSchema>
export type Employee = z.infer<typeof EmployeeSchema>

export const CreateEmployeeSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(7).max(20).optional(),
  warehouseId: z.number().int().optional(),
  roleIds: z.array(z.number().int()).optional(),
})

export type CreateEmployeeDto = z.infer<typeof CreateEmployeeSchema>

export const UpdateEmployeeSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().min(7).max(20).nullable().optional(),
  warehouseId: z.number().int().nullable().optional(),
  roleIds: z.array(z.number().int()).optional(),
  email: z.string().email().optional(),
  newPassword: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
})

export const UpdateOwnProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().min(7).max(20).nullable().optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
}).refine(
  (data) => {
    if (data.newPassword && !data.currentPassword) return false
    return true
  },
  { message: 'currentPassword is required when changing password', path: ['currentPassword'] }
)

export type UpdateEmployeeDto = z.infer<typeof UpdateEmployeeSchema>
export type UpdateOwnProfileDto = z.infer<typeof UpdateOwnProfileSchema>
