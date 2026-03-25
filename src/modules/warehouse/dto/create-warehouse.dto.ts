import { createZodDto } from 'nestjs-zod';
import { CreateWarehouseSchema } from '@meerkapp/wms-contracts';

export class CreateWarehouseDto extends createZodDto(CreateWarehouseSchema) {}
