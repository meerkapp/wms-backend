import { createZodDto } from 'nestjs-zod';
import { CreateRoleSchema } from '@meerkapp/wms-contracts';

export class CreateRoleDto extends createZodDto(CreateRoleSchema) {}
