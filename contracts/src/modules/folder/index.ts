import { z } from 'zod'

export const CreateFolderSchema = z.object({
  name: z.string().min(1),
  parentId: z.number().int().positive().optional().nullable(),
})

export const UpdateFolderSchema = CreateFolderSchema.partial()

export const FolderSchema = z.object({
  id: z.number(),
  name: z.string(),
  parentId: z.number().nullable(),
  pinnedAt: z.string().nullable(),
  pinOrder: z.number().nullable(),
  updatedAt: z.string(),
})

export type CreateFolderDto = z.infer<typeof CreateFolderSchema>
export type UpdateFolderDto = z.infer<typeof UpdateFolderSchema>
export type Folder = z.infer<typeof FolderSchema>
