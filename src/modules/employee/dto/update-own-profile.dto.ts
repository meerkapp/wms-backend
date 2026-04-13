import { createZodDto } from 'nestjs-zod';
import { UpdateOwnPasswordSchema, UpdateOwnProfileSchema } from '@meerkapp/wms-contracts';

export class UpdateOwnProfileDto extends createZodDto(UpdateOwnProfileSchema) {}
export class UpdateOwnPasswordDto extends createZodDto(UpdateOwnPasswordSchema) {}
