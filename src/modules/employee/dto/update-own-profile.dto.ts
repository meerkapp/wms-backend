import { createZodDto } from 'nestjs-zod';
import {
  UpdateOwnEmailSchema,
  UpdateOwnPasswordSchema,
  UpdateEmployeeEmailSchema,
  UpdateEmployeePasswordSchema,
} from '@meerkapp/wms-contracts';

export class UpdateOwnEmailDto extends createZodDto(UpdateOwnEmailSchema) {}
export class UpdateOwnPasswordDto extends createZodDto(UpdateOwnPasswordSchema) {}
export class UpdateEmployeeEmailDto extends createZodDto(UpdateEmployeeEmailSchema) {}
export class UpdateEmployeePasswordDto extends createZodDto(UpdateEmployeePasswordSchema) {}
