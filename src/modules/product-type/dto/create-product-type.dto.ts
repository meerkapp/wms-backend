import { createZodDto } from 'nestjs-zod';
import { CreateProductTypeSchema } from '@meerkapp/wms-contracts';

export class CreateProductTypeDto extends createZodDto(CreateProductTypeSchema) {}
