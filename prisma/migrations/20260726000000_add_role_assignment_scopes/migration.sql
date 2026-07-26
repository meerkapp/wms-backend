BEGIN;

CREATE TYPE "AccessScopeType" AS ENUM ('GLOBAL', 'WAREHOUSE');

ALTER TABLE "employee_role_assignment"
ADD COLUMN "scope_type" "AccessScopeType",
ADD COLUMN "warehouse_id" INTEGER;

UPDATE "employee_role_assignment"
SET "scope_type" = 'GLOBAL';

ALTER TABLE "employee_role_assignment"
ALTER COLUMN "scope_type" SET NOT NULL;

DROP INDEX "employee_role_assignment_employee_id_employee_role_id_key";

ALTER TABLE "employee_role_assignment"
ADD CONSTRAINT "employee_role_assignment_scope_check"
CHECK (
  (
    "scope_type" = 'GLOBAL'
    AND "warehouse_id" IS NULL
  )
  OR
  (
    "scope_type" = 'WAREHOUSE'
    AND "warehouse_id" IS NOT NULL
  )
);

ALTER TABLE "employee_role_assignment"
ADD CONSTRAINT "employee_role_assignment_warehouse_id_fkey"
FOREIGN KEY ("warehouse_id")
REFERENCES "warehouse"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

CREATE UNIQUE INDEX "employee_role_assignment_global_unique"
ON "employee_role_assignment" ("employee_id", "employee_role_id")
WHERE "scope_type" = 'GLOBAL';

CREATE UNIQUE INDEX "employee_role_assignment_warehouse_unique"
ON "employee_role_assignment" ("employee_id", "employee_role_id", "warehouse_id")
WHERE "scope_type" = 'WAREHOUSE';

CREATE INDEX "employee_role_assignment_employee_id_idx"
ON "employee_role_assignment" ("employee_id");

CREATE INDEX "employee_role_assignment_employee_role_id_idx"
ON "employee_role_assignment" ("employee_role_id");

CREATE INDEX "employee_role_assignment_warehouse_id_idx"
ON "employee_role_assignment" ("warehouse_id");

COMMIT;
