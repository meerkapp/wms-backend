import { LoginSchema } from '@meerkapp/wms-contracts';
import { createZodDto } from 'nestjs-zod';

export class LoginDto extends createZodDto(LoginSchema) {}
