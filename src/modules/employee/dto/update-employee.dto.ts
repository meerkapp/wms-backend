import { createZodDto } from 'nestjs-zod';
import { UpdateEmployeeSchema } from '@meerkapp/wms-contracts';

export class UpdateEmployeeDto extends createZodDto(UpdateEmployeeSchema) {}
