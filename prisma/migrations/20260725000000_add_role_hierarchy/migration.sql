ALTER TABLE "employee_role"
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Existing custom roles keep a deterministic order. Higher positions have
-- greater authority; superadmin is kept outside the normal reorder range.
WITH ranked_roles AS (
    SELECT
        id,
        ROW_NUMBER() OVER (ORDER BY id)::INTEGER AS position
    FROM employee_role
    WHERE name <> 'superadmin'
)
UPDATE employee_role role
SET position = ranked.position
FROM ranked_roles ranked
WHERE role.id = ranked.id;

UPDATE employee_role
SET position = 2000000000
WHERE name = 'superadmin';

CREATE INDEX "employee_role_position_idx"
ON "employee_role"("position");
