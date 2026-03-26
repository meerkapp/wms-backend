import { createZodDto } from 'nestjs-zod';
import { CreateLocalitySchema } from '@meerkapp/wms-contracts';

export class CreateLocalityDto extends createZodDto(CreateLocalitySchema) {}
