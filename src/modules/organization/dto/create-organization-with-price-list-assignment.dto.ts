import {
  CreateOrganizationSchema,
  SetDirectPriceListAssignmentSchema,
} from '@meerkapp/wms-contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateOrganizationWithPriceListAssignmentDto extends createZodDto(
  CreateOrganizationSchema.merge(SetDirectPriceListAssignmentSchema),
) {}
