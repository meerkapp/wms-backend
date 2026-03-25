import { createZodDto } from 'nestjs-zod';
import { CreateCitySchema } from '@meerkapp/wms-contracts';

export class CreateCityDto extends createZodDto(CreateCitySchema) {}
