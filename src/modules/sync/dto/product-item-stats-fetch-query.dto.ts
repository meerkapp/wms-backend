import { ProductItemStatsFetchQuerySchema } from '@meerkapp/wms-contracts';
import { createZodDto } from 'nestjs-zod';

export class ProductItemStatsFetchQueryDto extends createZodDto(
  ProductItemStatsFetchQuerySchema,
) {}
