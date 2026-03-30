import { createZodDto } from 'nestjs-zod';
import { UpdateOwnEmailSchema, UpdateOwnPasswordSchema } from '@meerkapp/wms-contracts';

export class UpdateOwnEmailDto extends createZodDto(UpdateOwnEmailSchema) {}
export class UpdateOwnPasswordDto extends createZodDto(UpdateOwnPasswordSchema) {}
