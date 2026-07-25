import { CreateProductItemSchema } from '@meerkapp/wms-contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateProductItemDto extends createZodDto(CreateProductItemSchema) {}
