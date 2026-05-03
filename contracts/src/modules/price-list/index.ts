import { z } from 'zod';
import { CurrencyCodeSchema } from '../../generated/schemas/enums/CurrencyCode.schema';
import { PriceListModelSchema } from '../../generated/schemas/variants/pure/PriceList.pure';

export const CreatePriceListSchema = z.object({
  name: z.string().min(1),
  currency: CurrencyCodeSchema,
});

export const UpdatePriceListSchema = CreatePriceListSchema.partial();

export const PriceListSchema = PriceListModelSchema.omit({
  prices: true,
  assignments: true,
}).extend({ updatedAt: z.string() });

export type CreatePriceListDto = z.infer<typeof CreatePriceListSchema>;
export type UpdatePriceListDto = z.infer<typeof UpdatePriceListSchema>;
export type PriceList = z.infer<typeof PriceListSchema>;
