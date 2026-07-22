CREATE TABLE "product_item_favorite" (
    "employee_id" UUID NOT NULL,
    "product_item_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_item_favorite_pkey" PRIMARY KEY ("employee_id", "product_item_id")
);

CREATE INDEX "product_item_favorite_product_item_id_idx"
ON "product_item_favorite"("product_item_id");

ALTER TABLE "product_item_favorite"
ADD CONSTRAINT "product_item_favorite_employee_id_fkey"
FOREIGN KEY ("employee_id") REFERENCES "employee"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_item_favorite"
ADD CONSTRAINT "product_item_favorite_product_item_id_fkey"
FOREIGN KEY ("product_item_id") REFERENCES "product_item"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
