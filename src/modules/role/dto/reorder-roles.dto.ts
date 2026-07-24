import { ReorderRolesSchema } from '@meerkapp/wms-contracts';
import { createZodDto } from 'nestjs-zod';

export class ReorderRolesDto extends createZodDto(ReorderRolesSchema) {}
