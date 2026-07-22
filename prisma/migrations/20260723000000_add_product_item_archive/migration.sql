ALTER TABLE "product_item"
ADD COLUMN "archived_at" TIMESTAMP(3),
ADD COLUMN "archived_by_employee_id" UUID;

CREATE INDEX "product_item_archived_at_sku_id_idx"
ON "product_item"("archived_at", "sku", "id");

ALTER TABLE "product_item"
ADD CONSTRAINT "product_item_archived_by_employee_id_fkey"
FOREIGN KEY ("archived_by_employee_id") REFERENCES "employee"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "ensure_active_product_item_for_shipment"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_archived_at TIMESTAMP(3);
BEGIN
    SELECT archived_at INTO v_archived_at
    FROM product_item
    WHERE id = NEW.product_item_id
    FOR KEY SHARE;

    IF FOUND AND v_archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot change stock for archived product item %', NEW.product_item_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "product_shipment_require_active_product_item"
BEFORE INSERT OR UPDATE OF product_item_id, quantity ON "product_shipment"
FOR EACH ROW EXECUTE FUNCTION "ensure_active_product_item_for_shipment"();
