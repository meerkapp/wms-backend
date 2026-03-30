-- Drop foreign key constraints
ALTER TABLE "employee_role_assignment" DROP CONSTRAINT "employee_role_assignment_employee_role_id_fkey";
ALTER TABLE "employee_role_permission" DROP CONSTRAINT "employee_role_permission_employee_role_id_fkey";
ALTER TABLE "employee_role_permission" DROP CONSTRAINT "employee_role_permission_employee_permission_id_fkey";

-- Change employee_role
ALTER TABLE "employee_role" DROP CONSTRAINT "employee_role_pkey";
ALTER TABLE "employee_role" ALTER COLUMN "id" TYPE INTEGER USING "id"::INTEGER;
CREATE SEQUENCE IF NOT EXISTS employee_role_id_seq AS INTEGER OWNED BY "employee_role"."id";
SELECT setval('employee_role_id_seq', (SELECT MAX(id) FROM "employee_role"));
ALTER TABLE "employee_role" ALTER COLUMN "id" SET DEFAULT nextval('employee_role_id_seq');
ALTER TABLE "employee_role" ADD CONSTRAINT "employee_role_pkey" PRIMARY KEY ("id");

-- Change employee_permission
ALTER TABLE "employee_permission" DROP CONSTRAINT "employee_permission_pkey";
ALTER TABLE "employee_permission" ALTER COLUMN "id" TYPE INTEGER USING "id"::INTEGER;
CREATE SEQUENCE IF NOT EXISTS employee_permission_id_seq AS INTEGER OWNED BY "employee_permission"."id";
SELECT setval('employee_permission_id_seq', (SELECT MAX(id) FROM "employee_permission"));
ALTER TABLE "employee_permission" ALTER COLUMN "id" SET DEFAULT nextval('employee_permission_id_seq');
ALTER TABLE "employee_permission" ADD CONSTRAINT "employee_permission_pkey" PRIMARY KEY ("id");

-- Change employee_role_assignment
ALTER TABLE "employee_role_assignment" DROP CONSTRAINT "employee_role_assignment_pkey";
ALTER TABLE "employee_role_assignment" ALTER COLUMN "id" TYPE INTEGER USING "id"::INTEGER;
ALTER TABLE "employee_role_assignment" ALTER COLUMN "employee_role_id" TYPE INTEGER USING "employee_role_id"::INTEGER;
CREATE SEQUENCE IF NOT EXISTS employee_role_assignment_id_seq AS INTEGER OWNED BY "employee_role_assignment"."id";
SELECT setval('employee_role_assignment_id_seq', (SELECT MAX(id) FROM "employee_role_assignment"));
ALTER TABLE "employee_role_assignment" ALTER COLUMN "id" SET DEFAULT nextval('employee_role_assignment_id_seq');
ALTER TABLE "employee_role_assignment" ADD CONSTRAINT "employee_role_assignment_pkey" PRIMARY KEY ("id");

-- Change employee_role_permission
ALTER TABLE "employee_role_permission" DROP CONSTRAINT "employee_role_permission_pkey";
ALTER TABLE "employee_role_permission" ALTER COLUMN "id" TYPE INTEGER USING "id"::INTEGER;
ALTER TABLE "employee_role_permission" ALTER COLUMN "employee_role_id" TYPE INTEGER USING "employee_role_id"::INTEGER;
ALTER TABLE "employee_role_permission" ALTER COLUMN "employee_permission_id" TYPE INTEGER USING "employee_permission_id"::INTEGER;
CREATE SEQUENCE IF NOT EXISTS employee_role_permission_id_seq AS INTEGER OWNED BY "employee_role_permission"."id";
SELECT setval('employee_role_permission_id_seq', (SELECT MAX(id) FROM "employee_role_permission"));
ALTER TABLE "employee_role_permission" ALTER COLUMN "id" SET DEFAULT nextval('employee_role_permission_id_seq');
ALTER TABLE "employee_role_permission" ADD CONSTRAINT "employee_role_permission_pkey" PRIMARY KEY ("id");

-- Restore foreign key constraints
ALTER TABLE "employee_role_assignment" ADD CONSTRAINT "employee_role_assignment_employee_role_id_fkey"
  FOREIGN KEY ("employee_role_id") REFERENCES "employee_role"("id") ON DELETE CASCADE;
ALTER TABLE "employee_role_permission" ADD CONSTRAINT "employee_role_permission_employee_role_id_fkey"
  FOREIGN KEY ("employee_role_id") REFERENCES "employee_role"("id") ON DELETE CASCADE;
ALTER TABLE "employee_role_permission" ADD CONSTRAINT "employee_role_permission_employee_permission_id_fkey"
  FOREIGN KEY ("employee_permission_id") REFERENCES "employee_permission"("id") ON DELETE CASCADE;
