import {
  SetDirectPriceListAssignmentSchema,
  UpdateOrganizationSchema,
} from '@meerkapp/wms-contracts';
import { createZodDto } from 'nestjs-zod';

export class UpdateOrganizationWithPriceListAssignmentDto extends createZodDto(
  UpdateOrganizationSchema.merge(SetDirectPriceListAssignmentSchema),
) {}
