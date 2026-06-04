import { createZodDto } from 'nestjs-zod';
import { CreatePriceListSchema } from '@meerkapp/wms-contracts';

export class CreatePriceListDto extends createZodDto(CreatePriceListSchema) {}
