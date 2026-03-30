import { createZodDto } from 'nestjs-zod';
import { UpdateRoleSchema } from '@meerkapp/wms-contracts';

export class UpdateRoleDto extends createZodDto(UpdateRoleSchema) {}
