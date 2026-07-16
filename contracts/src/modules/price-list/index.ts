import { z } from 'zod';
import { CurrencyCodeSchema } from '../../common/currency';
import { PriceListTargetTypeSchema } from '../../generated/schemas/enums/PriceListTargetType.schema';
import { PriceListModelSchema } from '../../generated/schemas/variants/pure/PriceList.pure';

const IdArraySchema = z.array(z.number().int().positive());
const UniqueIdArraySchema = IdArraySchema.refine((ids) => new Set(ids).size === ids.length, {
  message: 'Target ids must be unique',
});

const UniqueIdArraysSchema = z.object({
  localityIds: UniqueIdArraySchema.default([]),
  countryIds: UniqueIdArraySchema.default([]),
});

const PriceListFieldsSchema = z.object({
  name: z.string().min(1),
  currency: CurrencyCodeSchema,
});

export const CreatePriceListSchema = PriceListFieldsSchema.merge(UniqueIdArraysSchema);

export const UpdatePriceListSchema = PriceListFieldsSchema.partial()
  .extend({
    localityIds: UniqueIdArraySchema.optional(),
    countryIds: UniqueIdArraySchema.optional(),
  })
  .superRefine((value, context) => {
    if ((value.localityIds === undefined) !== (value.countryIds === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['localityIds'],
        message: 'localityIds and countryIds must be provided together',
      });
    }
  });

export const PriceListSchema = PriceListModelSchema.omit({
  prices: true,
  assignments: true,
}).extend({
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PriceListSummarySchema = PriceListSchema.extend({
  assignmentCount: z.number().int().nonnegative(),
  priceCount: z.number().int().nonnegative(),
  localityIds: IdArraySchema,
  countryIds: IdArraySchema,
});

export const PriceListAssignmentSchema = z.object({
  id: z.number().int().positive(),
  priceListId: z.number().int().positive(),
  targetType: PriceListTargetTypeSchema,
  warehouseId: z.number().int().positive().nullable(),
  organizationId: z.number().int().positive().nullable(),
  localityId: z.number().int().positive().nullable(),
  countryId: z.number().int().positive().nullable(),
});

export const SetPriceListAssignmentsSchema = z.object({
  warehouseIds: UniqueIdArraySchema,
  organizationIds: UniqueIdArraySchema,
  localityIds: UniqueIdArraySchema,
  countryIds: UniqueIdArraySchema,
});

export const DirectPriceListAssignmentSchema = z.object({
  priceListId: z.number().int().positive().nullable(),
});

export const SetDirectPriceListAssignmentSchema = DirectPriceListAssignmentSchema;

export const ProductPriceSchema = z.object({
  id: z.number().int().positive(),
  priceListId: z.number().int().positive(),
  productPackageId: z.number().int().positive(),
  priceAmount: z.string().regex(/^\d+$/),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ProductPriceInputSchema = z.object({
  productPackageId: z.number().int().positive(),
  priceAmount: z.string().regex(/^\d+$/),
});

export const UpdatePriceListPricesSchema = z
  .object({
    upserted: z.array(ProductPriceInputSchema),
    removedProductPackageIds: IdArraySchema,
  })
  .superRefine((value, context) => {
    const upsertedIds = value.upserted.map((price) => price.productPackageId);
    if (new Set(upsertedIds).size !== upsertedIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['upserted'],
        message: 'Product package ids must be unique',
      });
    }

    const removedIds = value.removedProductPackageIds;
    if (new Set(removedIds).size !== removedIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['removedProductPackageIds'],
        message: 'Product package ids must be unique',
      });
    }

    const removedIdSet = new Set(removedIds);
    if (upsertedIds.some((id) => removedIdSet.has(id))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['removedProductPackageIds'],
        message: 'A product package cannot be updated and removed in the same request',
      });
    }
  });

export type CreatePriceListDto = z.infer<typeof CreatePriceListSchema>;
export type UpdatePriceListDto = z.infer<typeof UpdatePriceListSchema>;
export type PriceList = z.infer<typeof PriceListSchema>;
export type PriceListSummary = z.infer<typeof PriceListSummarySchema>;
export type PriceListAssignment = z.infer<typeof PriceListAssignmentSchema>;
export type SetPriceListAssignmentsDto = z.infer<typeof SetPriceListAssignmentsSchema>;
export type SetDirectPriceListAssignmentDto = z.infer<typeof SetDirectPriceListAssignmentSchema>;
export type DirectPriceListAssignment = z.infer<typeof DirectPriceListAssignmentSchema>;
export type ProductPrice = z.infer<typeof ProductPriceSchema>;
export type ProductPriceInput = z.infer<typeof ProductPriceInputSchema>;
export type UpdatePriceListPricesDto = z.infer<typeof UpdatePriceListPricesSchema>;
