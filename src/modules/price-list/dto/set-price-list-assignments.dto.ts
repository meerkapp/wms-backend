import { createZodDto } from 'nestjs-zod';
import { SetPriceListAssignmentsSchema } from '@meerkapp/wms-contracts';

export class SetPriceListAssignmentsDto extends createZodDto(SetPriceListAssignmentsSchema) {}
