import { PaginationQuerySchema } from '@meerkapp/wms-contracts';
import { createZodDto } from 'nestjs-zod';

export class FindProductItemFavoritesDto extends createZodDto(PaginationQuerySchema) {}
