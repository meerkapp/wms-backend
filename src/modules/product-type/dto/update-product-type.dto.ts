import { createZodDto } from 'nestjs-zod';
import { UpdateProductTypeSchema } from '@meerkapp/wms-contracts';

export class UpdateProductTypeDto extends createZodDto(UpdateProductTypeSchema) {}
