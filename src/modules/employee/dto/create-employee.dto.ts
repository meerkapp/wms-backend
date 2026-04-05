import { createZodDto } from 'nestjs-zod';
import { CreateEmployeeSchema } from '@meerkapp/wms-contracts';

export class CreateEmployeeDto extends createZodDto(CreateEmployeeSchema) {}
