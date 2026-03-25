import { createZodDto } from 'nestjs-zod';
import { CreateCountrySchema } from '@meerkapp/wms-contracts';

export class CreateCountryDto extends createZodDto(CreateCountrySchema) {}
