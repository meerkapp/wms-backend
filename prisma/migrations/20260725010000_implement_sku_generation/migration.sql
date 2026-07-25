-- SKU generation modes describe how a ProductItem receives its immutable SKU.
ALTER TYPE "SkuMode" RENAME VALUE 'GLOBAL' TO 'SEQUENTIAL';
ALTER TYPE "SkuMode" RENAME VALUE 'CUSTOM' TO 'TEMPLATE';
ALTER TYPE "SkuMode" ADD VALUE 'MANUAL';

ALTER TABLE "product_type"
ALTER COLUMN "sku_mode" SET DEFAULT 'SEQUENTIAL',
DROP COLUMN "sku_counter";

-- One process-independent sequence is shared by sequential and templated SKUs.
-- It starts after the largest existing product id to reduce collisions with
-- pre-existing sequential SKUs during upgrades.
CREATE SEQUENCE "product_sku_seq"
AS BIGINT
START WITH 1
INCREMENT BY 1
NO CYCLE;

SELECT setval(
    'product_sku_seq',
    GREATEST(COALESCE(MAX("id"), 0) + 1, 1),
    false
)
FROM "product_item";

-- A nullable request id keeps legacy/direct inserts compatible while allowing
-- the public create endpoint to make client retries idempotent.
ALTER TABLE "product_item"
ADD COLUMN "creation_request_id" UUID;

CREATE UNIQUE INDEX "product_item_creation_request_id_key"
ON "product_item"("creation_request_id");
