import { createZodDto } from 'nestjs-zod';
import { ProductItemStatsQuerySchema } from '@meerkapp/wms-contracts';

export class ProductItemStatsQueryDto extends createZodDto(ProductItemStatsQuerySchema) {}
