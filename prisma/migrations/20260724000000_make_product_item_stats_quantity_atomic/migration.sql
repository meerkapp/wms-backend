-- Quantity is maintained as a delta instead of recalculating SUM(quantity).
-- Recalculation is vulnerable to a lost update when concurrent shipment
-- mutations read the same snapshot and then overwrite each other's result.
CREATE OR REPLACE FUNCTION "adjust_stats_quantity"(
    p_product_item_id INT,
    p_warehouse_id INT,
    p_delta DECIMAL(12,3)
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    INSERT INTO product_item_stats (
        product_item_id,
        warehouse_id,
        quantity,
        retail_price,
        currency,
        updated_at
    )
    SELECT
        p_product_item_id,
        p_warehouse_id,
        GREATEST(p_delta, 0),
        rp.retail_price,
        rp.currency,
        NOW()
    FROM resolve_retail_price(p_product_item_id, p_warehouse_id) rp
    ON CONFLICT (product_item_id, warehouse_id) DO UPDATE
    SET
        quantity = product_item_stats.quantity + p_delta,
        updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION "trg_product_shipment_stats"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_id INT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM adjust_stats_quantity(
            NEW.product_item_id,
            NEW.warehouse_id,
            GREATEST(NEW.quantity, 0)
        );
        v_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM adjust_stats_quantity(
            OLD.product_item_id,
            OLD.warehouse_id,
            -GREATEST(OLD.quantity, 0)
        );
        v_id := OLD.id;
    ELSE
        IF OLD.product_item_id = NEW.product_item_id
           AND OLD.warehouse_id = NEW.warehouse_id THEN
            PERFORM adjust_stats_quantity(
                NEW.product_item_id,
                NEW.warehouse_id,
                GREATEST(NEW.quantity, 0) - GREATEST(OLD.quantity, 0)
            );
        ELSIF (OLD.product_item_id, OLD.warehouse_id)
              < (NEW.product_item_id, NEW.warehouse_id) THEN
            -- Lock aggregate rows in a stable order so opposite stock moves
            -- cannot deadlock each other.
            PERFORM adjust_stats_quantity(
                OLD.product_item_id,
                OLD.warehouse_id,
                -GREATEST(OLD.quantity, 0)
            );
            PERFORM adjust_stats_quantity(
                NEW.product_item_id,
                NEW.warehouse_id,
                GREATEST(NEW.quantity, 0)
            );
        ELSE
            PERFORM adjust_stats_quantity(
                NEW.product_item_id,
                NEW.warehouse_id,
                GREATEST(NEW.quantity, 0)
            );
            PERFORM adjust_stats_quantity(
                OLD.product_item_id,
                OLD.warehouse_id,
                -GREATEST(OLD.quantity, 0)
            );
        END IF;
        v_id := NEW.id;
    END IF;

    PERFORM pg_notify('db_change', json_build_object(
        'table', TG_TABLE_NAME,
        'op', lower(TG_OP),
        'id', v_id
    )::text);

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Repair any drift created by the previous read-sum-write trigger before the
-- new delta-based trigger starts maintaining the aggregate.
UPDATE product_item_stats pis
SET
    quantity = COALESCE((
        SELECT SUM(ps.quantity)
        FROM product_shipment ps
        WHERE ps.product_item_id = pis.product_item_id
          AND ps.warehouse_id = pis.warehouse_id
          AND ps.quantity > 0
    ), 0),
    updated_at = NOW();

INSERT INTO product_item_stats (
    product_item_id,
    warehouse_id,
    quantity,
    retail_price,
    currency,
    updated_at
)
SELECT
    totals.product_item_id,
    totals.warehouse_id,
    totals.quantity,
    rp.retail_price,
    rp.currency,
    NOW()
FROM (
    SELECT
        ps.product_item_id,
        ps.warehouse_id,
        SUM(ps.quantity) AS quantity
    FROM product_shipment ps
    WHERE ps.quantity > 0
    GROUP BY ps.product_item_id, ps.warehouse_id
) totals
CROSS JOIN LATERAL resolve_retail_price(
    totals.product_item_id,
    totals.warehouse_id
) rp
ON CONFLICT (product_item_id, warehouse_id) DO UPDATE
SET
    quantity = EXCLUDED.quantity,
    updated_at = NOW();
