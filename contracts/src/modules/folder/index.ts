import { z } from 'zod'

export const CreateFolderSchema = z.object({
  name: z.string().min(1),
  parentId: z.number().int().positive().optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
})

export const UpdateFolderSchema = CreateFolderSchema.partial()

export const FolderSchema = z.object({
  id: z.number(),
  name: z.string(),
  parentId: z.number().nullable(),
  sortOrder: z.number(),
  updatedAt: z.string(),
})

export type CreateFolderDto = z.infer<typeof CreateFolderSchema>
export type UpdateFolderDto = z.infer<typeof UpdateFolderSchema>
export type Folder = z.infer<typeof FolderSchema>
