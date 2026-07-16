import { CreateWarehouseSchema, SetDirectPriceListAssignmentSchema } from '@meerkapp/wms-contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateWarehouseWithPriceListAssignmentDto extends createZodDto(
  CreateWarehouseSchema.merge(SetDirectPriceListAssignmentSchema),
) {}
