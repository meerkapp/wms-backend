-- Older contracts allowed a template to be stored for GLOBAL mode even though
-- it was never used. Non-template modes keep no inactive template state.
UPDATE "product_type"
SET
    "sku_template" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "sku_mode" <> 'TEMPLATE'
  AND "sku_template" IS NOT NULL;
