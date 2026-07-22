-- Package conversion participates in stock calculations and must use exact
-- decimal arithmetic rather than binary floating-point arithmetic.
ALTER TABLE "product_package"
ALTER COLUMN "conversion_factor" DROP DEFAULT;

ALTER TABLE "product_package"
ALTER COLUMN "conversion_factor" TYPE DECIMAL(18, 6)
USING ROUND("conversion_factor"::numeric, 6);

ALTER TABLE "product_package"
ALTER COLUMN "conversion_factor" SET DEFAULT 1;

ALTER TABLE "product_package"
ADD CONSTRAINT "product_package_conversion_factor_positive"
CHECK ("conversion_factor" > 0),
ADD CONSTRAINT "product_package_base_conversion_factor_one"
CHECK (NOT "is_base" OR "conversion_factor" = 1);
