import { SetDirectPriceListAssignmentSchema } from '@meerkapp/wms-contracts';
import { createZodDto } from 'nestjs-zod';

export class SetDirectPriceListAssignmentDto extends createZodDto(
  SetDirectPriceListAssignmentSchema,
) {}
