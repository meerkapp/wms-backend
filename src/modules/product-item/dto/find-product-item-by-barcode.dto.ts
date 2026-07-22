import { ProductItemBarcodeQuerySchema } from '@meerkapp/wms-contracts';
import { createZodDto } from 'nestjs-zod';

export class FindProductItemByBarcodeDto extends createZodDto(ProductItemBarcodeQuerySchema) {}
