import { createZodDto } from 'nestjs-zod';
import { UpdateFolderSchema } from '@meerkapp/wms-contracts';

export class UpdateFolderDto extends createZodDto(UpdateFolderSchema) {}
