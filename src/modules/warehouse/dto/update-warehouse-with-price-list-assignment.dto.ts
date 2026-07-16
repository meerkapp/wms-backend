import { SetDirectPriceListAssignmentSchema, UpdateWarehouseSchema } from '@meerkapp/wms-contracts';
import { createZodDto } from 'nestjs-zod';

export class UpdateWarehouseWithPriceListAssignmentDto extends createZodDto(
  UpdateWarehouseSchema.merge(SetDirectPriceListAssignmentSchema),
) {}
