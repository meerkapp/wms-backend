import { createZodDto } from 'nestjs-zod';
import { CreateFolderSchema } from '@meerkapp/wms-contracts';

export class CreateFolderDto extends createZodDto(CreateFolderSchema) {}
