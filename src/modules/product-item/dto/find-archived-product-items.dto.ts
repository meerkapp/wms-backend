import { PaginationQuerySchema } from '@meerkapp/wms-contracts';
import { createZodDto } from 'nestjs-zod';

export class FindArchivedProductItemsDto extends createZodDto(PaginationQuerySchema) {}
