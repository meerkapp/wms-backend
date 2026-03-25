import { createZodDto } from 'nestjs-zod';
import { UpdateWarehouseSchema } from '@meerkapp/wms-contracts';

export class UpdateWarehouseDto extends createZodDto(UpdateWarehouseSchema) {}
