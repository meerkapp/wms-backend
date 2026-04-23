import { createZodDto } from 'nestjs-zod';
import { CreateProductCollectionSchema } from '@meerkapp/wms-contracts';

export class CreateProductCollectionDto extends createZodDto(CreateProductCollectionSchema) {}
