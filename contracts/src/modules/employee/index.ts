import { z } from 'zod'
import { EmployeeModelSchema } from '../../generated/schemas/variants/pure/Employee.pure'
import { EmployeeRoleModelSchema } from '../../generated/schemas/variants/pure/EmployeeRole.pure'

export const EmployeeRoleSchema = EmployeeRoleModelSchema
  .omit({ assignments: true, permissions: true })
  .extend({ id: z.number(), position: z.number().int(), updatedAt: z.string() })

const EmployeeRoleAssignmentResponseBaseSchema = z.object({
  id: z.number().int(),
  employeeRole: EmployeeRoleSchema,
})

export const EmployeeRoleAssignmentSchema = z.discriminatedUnion('scopeType', [
  EmployeeRoleAssignmentResponseBaseSchema.extend({
    scopeType: z.literal('GLOBAL'),
    warehouseId: z.null(),
  }),
  EmployeeRoleAssignmentResponseBaseSchema.extend({
    scopeType: z.literal('WAREHOUSE'),
    warehouseId: z.number().int().positive(),
  }),
])

export const EmployeeSchema = EmployeeModelSchema
  .omit({
    password: true,
    warehouse: true,
    roleAssignments: true,
    productFavorites: true,
    archivedProducts: true,
  })
  .extend({
    avatarUrl: z.string().nullable(),
    phone: z.string().nullable(),
    lastSeen: z.string().nullable(),
    updatedAt: z.string(),
    roleAssignments: z.array(EmployeeRoleAssignmentSchema),
  })

export type EmployeeRole = z.infer<typeof EmployeeRoleSchema>
export type EmployeeRoleAssignment = z.infer<typeof EmployeeRoleAssignmentSchema>
export type Employee = z.infer<typeof EmployeeSchema>

export const EmployeeRoleAssignmentInputSchema = z.discriminatedUnion('scopeType', [
  z
    .object({
      roleId: z.number().int().positive(),
      scopeType: z.literal('GLOBAL'),
      warehouseId: z.never().optional(),
    })
    .strict(),
  z
    .object({
      roleId: z.number().int().positive(),
      scopeType: z.literal('WAREHOUSE'),
      warehouseId: z.number().int().positive(),
    })
    .strict(),
])

export const EmployeeRoleAssignmentInputListSchema = z
  .array(EmployeeRoleAssignmentInputSchema)
  .refine(
    (assignments) => {
      const keys = assignments.map(({ roleId, scopeType, ...scope }) =>
        scopeType === 'GLOBAL' ? `${roleId}:GLOBAL` : `${roleId}:WAREHOUSE:${scope.warehouseId}`,
      )
      return new Set(keys).size === keys.length
    },
    { message: 'Role assignments must be unique' },
  )
  .refine(
    (assignments) => {
      const globalRoleIds = new Set(
        assignments.filter(({ scopeType }) => scopeType === 'GLOBAL').map(({ roleId }) => roleId),
      )
      return !assignments.some(
        ({ roleId, scopeType }) => scopeType === 'WAREHOUSE' && globalRoleIds.has(roleId),
      )
    },
    {
      message: 'A global role assignment cannot be combined with warehouse assignments',
    },
  )

export type EmployeeRoleAssignmentInput = z.infer<typeof EmployeeRoleAssignmentInputSchema>

export const CreateEmployeeSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().min(7).max(20).optional(),
    warehouseId: z.number().int().optional(),
    roleAssignments: EmployeeRoleAssignmentInputListSchema.optional(),
  })
  .strict()

export type CreateEmployeeDto = z.infer<typeof CreateEmployeeSchema>

export const UpdateEmployeeSchema = z
  .object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    phone: z.string().min(7).max(20).nullable().optional(),
    warehouseId: z.number().int().nullable().optional(),
    roleAssignments: EmployeeRoleAssignmentInputListSchema.optional(),
    email: z.string().email().optional(),
    newPassword: z.string().min(8).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()

export const UpdateOwnProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().min(7).max(20).nullable().optional(),
  email: z.string().email().optional(),
})

export const UpdateOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

export type UpdateEmployeeDto = z.infer<typeof UpdateEmployeeSchema>
export type UpdateOwnProfileDto = z.infer<typeof UpdateOwnProfileSchema>
export type UpdateOwnPasswordDto = z.infer<typeof UpdateOwnPasswordSchema>
