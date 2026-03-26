import { z } from 'zod'
import { WarehouseModelSchema } from '../../generated/schemas/variants/pure/Warehouse.pure'

export const CreateWarehouseSchema = z.object({
  address: z.string().min(1),
  note: z.string().optional().nullable(),
  code: z.string().min(1),
  organizationId: z.number().int().positive(),
  localityId: z.number().int().positive(),
})

export const UpdateWarehouseSchema = CreateWarehouseSchema.partial()

export const WarehouseSchema = WarehouseModelSchema
  .omit({ organization: true, locality: true })
  .extend({ updatedAt: z.string() })

export type CreateWarehouseDto = z.infer<typeof CreateWarehouseSchema>
export type UpdateWarehouseDto = z.infer<typeof UpdateWarehouseSchema>
export type Warehouse = z.infer<typeof WarehouseSchema>
