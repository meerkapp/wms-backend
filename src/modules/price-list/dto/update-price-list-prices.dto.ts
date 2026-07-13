import { createZodDto } from 'nestjs-zod';
import { UpdatePriceListPricesSchema } from '@meerkapp/wms-contracts';

export class UpdatePriceListPricesDto extends createZodDto(UpdatePriceListPricesSchema) {}
