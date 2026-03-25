import { z } from 'zod'
import { OrganizationModelSchema } from '../../generated/schemas/variants/pure/Organization.pure'

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1),
  website: z.string().url().optional().nullable(),
})

export const UpdateOrganizationSchema = CreateOrganizationSchema.partial()

export const OrganizationSchema = OrganizationModelSchema
  .omit({ warehouses: true })
  .extend({ updatedAt: z.string() })

export type CreateOrganizationDto = z.infer<typeof CreateOrganizationSchema>
export type UpdateOrganizationDto = z.infer<typeof UpdateOrganizationSchema>
export type Organization = z.infer<typeof OrganizationSchema>

export interface OrganizationStats {
  warehouseCount: number
  employeeCount: number
}
