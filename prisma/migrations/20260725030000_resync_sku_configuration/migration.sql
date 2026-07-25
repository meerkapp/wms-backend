-- Enum value renames do not touch ProductType rows. Advance their sync cursor
-- so existing offline read models replace legacy GLOBAL/CUSTOM values.
UPDATE "product_type"
SET "updated_at" = CURRENT_TIMESTAMP;
