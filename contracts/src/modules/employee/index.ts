import { z } from 'zod'
import { EmployeeModelSchema } from '../../generated/schemas/variants/pure/Employee.pure'
import { EmployeeRoleModelSchema } from '../../generated/schemas/variants/pure/EmployeeRole.pure'

export const EmployeeRoleSchema = EmployeeRoleModelSchema
  .omit({ assignments: true, permissions: true })
  .extend({ id: z.number(), updatedAt: z.string() })

export const EmployeeSchema = EmployeeModelSchema
  .omit({ password: true, warehouse: true, roleAssignments: true })
  .extend({
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

export const UpdateEmployeeSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  isActive: z.boolean().optional(),
  warehouseId: z.number().int().nullable().optional(),
})

export const UpdateOwnEmailSchema = z.object({
  email: z.string().email(),
})

export const UpdateOwnPasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
})

export type UpdateEmployeeDto = z.infer<typeof UpdateEmployeeSchema>
export type UpdateOwnEmailDto = z.infer<typeof UpdateOwnEmailSchema>
export type UpdateOwnPasswordDto = z.infer<typeof UpdateOwnPasswordSchema>
