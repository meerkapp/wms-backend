import { createZodDto } from 'nestjs-zod';
import { UpdatePriceListSchema } from '@meerkapp/wms-contracts';

export class UpdatePriceListDto extends createZodDto(UpdatePriceListSchema) {}
