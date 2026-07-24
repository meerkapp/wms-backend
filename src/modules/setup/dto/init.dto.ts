import { SetupInitSchema } from '@meerkapp/wms-contracts';
import { createZodDto } from 'nestjs-zod';

export class InitDto extends createZodDto(SetupInitSchema) {}
