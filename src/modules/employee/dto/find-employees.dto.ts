import { createZodDto } from 'nestjs-zod';
import { PaginationQuerySchema } from '@meerkapp/wms-contracts';

export class FindEmployeesDto extends createZodDto(PaginationQuerySchema) {}
