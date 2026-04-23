import { createZodDto } from 'nestjs-zod';
import { UpdateProductCollectionSchema } from '@meerkapp/wms-contracts';

export class UpdateProductCollectionDto extends createZodDto(UpdateProductCollectionSchema) {}
