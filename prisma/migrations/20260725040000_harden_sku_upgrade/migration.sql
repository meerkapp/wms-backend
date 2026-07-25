-- Preserve only legacy templates that satisfy the implemented SKU contract.
-- The previous releases accepted templates that the backend never rendered,
-- including unsupported static characters and unresolved characteristic keys.
WITH "template_tokens" AS (
    SELECT
        "product_type"."id",
        ("match"."parts")[1] AS "key",
        ("match"."parts")[2]::integer AS "requested_length"
    FROM "product_type"
    CROSS JOIN LATERAL regexp_matches(
        "product_type"."sku_template",
        '\{([a-z][a-z0-9_]*)(?::([0-9]+))?\}',
        'g'
    ) AS "match"("parts")
    WHERE "product_type"."sku_mode" = 'TEMPLATE'
      AND "product_type"."sku_template" IS NOT NULL
),
"invalid_templates" AS (
    SELECT "product_type"."id"
    FROM "product_type"
    WHERE "product_type"."sku_mode" = 'TEMPLATE'
      AND (
          "product_type"."sku_template" IS NULL
          OR length("product_type"."sku_template") > 128
          OR "product_type"."sku_template"
              !~ '^(\{(seq|[a-z][a-z0-9_]*)(:[1-9][0-9]?)?\}|[A-Za-z0-9._-]+)+$'
          OR EXISTS (
              SELECT 1
              FROM "template_tokens"
              WHERE "template_tokens"."id" = "product_type"."id"
                AND "template_tokens"."requested_length" > 18
          )
          OR length(
              regexp_replace(
                  "product_type"."sku_template",
                  '\{([a-z][a-z0-9_]*)(?::([0-9]+))?\}',
                  '',
                  'g'
              )
          ) + COALESCE((
              SELECT SUM(
                  CASE
                      WHEN "template_tokens"."key" = 'seq'
                          THEN COALESCE("template_tokens"."requested_length", 1)
                      ELSE 1
                  END
              )
              FROM "template_tokens"
              WHERE "template_tokens"."id" = "product_type"."id"
          ), 0) > 64
          OR EXISTS (
              SELECT 1
              FROM "template_tokens"
              WHERE "template_tokens"."id" = "product_type"."id"
                AND "template_tokens"."key" <> 'seq'
                AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof("product_type"."characteristics_scheme") = 'array'
                                THEN "product_type"."characteristics_scheme"
                            ELSE '[]'::jsonb
                        END
                    ) AS "characteristic"("value")
                    WHERE "characteristic"."value"->>'key' = "template_tokens"."key"
                      AND "characteristic"."value"->>'type' IN ('number', 'select', 'toggle')
                      AND "characteristic"."value"->>'required' = 'true'
                      AND (
                          "characteristic"."value"->>'type' <> 'select'
                          OR (
                              jsonb_typeof("characteristic"."value"->'options') = 'array'
                              AND NOT EXISTS (
                                  SELECT 1
                                  FROM jsonb_array_elements(
                                      "characteristic"."value"->'options'
                                  ) AS "option"("value")
                                  WHERE COALESCE("option"."value"->>'value', '')
                                      !~ '^[A-Za-z0-9._-]+$'
                              )
                          )
                      )
                )
          )
      )
)
UPDATE "product_type"
SET
    "sku_mode" = 'SEQUENTIAL',
    "sku_template" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "id" IN (SELECT "id" FROM "invalid_templates");

-- Keep the sequence ahead of both its current state and existing numeric SKUs.
WITH "sequence_candidates" AS (
    SELECT
        CASE
            WHEN "is_called" THEN "last_value"::numeric + 1
            ELSE "last_value"::numeric
        END AS "next_value"
    FROM "product_sku_seq"

    UNION ALL

    SELECT COALESCE(MAX("id"), 0)::numeric + 1
    FROM "product_item"

    UNION ALL

    SELECT COALESCE(MAX("sku"::numeric), 0) + 1
    FROM "product_item"
    WHERE "sku" ~ '^[0-9]{1,18}$'
)
SELECT setval(
    'product_sku_seq',
    MAX("next_value")::bigint,
    false
)
FROM "sequence_candidates";
