import { z } from 'zod'

export const CreateProductCollectionSchema = z.object({
  name: z.string().min(1),
  folderId: z.number().int().positive().optional().nullable(),
  defaultProductTypeId: z.number().int().positive().optional().nullable(),
})

export const UpdateProductCollectionSchema = CreateProductCollectionSchema.partial()

export const ProductCollectionSchema = z.object({
  id: z.number(),
  name: z.string(),
  folderId: z.number().nullable(),
  defaultProductTypeId: z.number().nullable(),
  pinnedAt: z.string().nullable(),
  pinOrder: z.number().nullable(),
  updatedAt: z.string(),
})

export type CreateProductCollectionDto = z.infer<typeof CreateProductCollectionSchema>
export type UpdateProductCollectionDto = z.infer<typeof UpdateProductCollectionSchema>
export type ProductCollection = z.infer<typeof ProductCollectionSchema>
