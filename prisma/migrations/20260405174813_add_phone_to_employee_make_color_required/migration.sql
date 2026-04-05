/*
  Warnings:

  - Made the column `color` on table `employee_role` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "employee_role_assignment" DROP CONSTRAINT "employee_role_assignment_employee_role_id_fkey";

-- DropForeignKey
ALTER TABLE "employee_role_permission" DROP CONSTRAINT "employee_role_permission_employee_permission_id_fkey";

-- DropForeignKey
ALTER TABLE "employee_role_permission" DROP CONSTRAINT "employee_role_permission_employee_role_id_fkey";

-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "employee_role" ALTER COLUMN "color" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "employee_role_assignment" ADD CONSTRAINT "employee_role_assignment_employee_role_id_fkey" FOREIGN KEY ("employee_role_id") REFERENCES "employee_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_role_permission" ADD CONSTRAINT "employee_role_permission_employee_role_id_fkey" FOREIGN KEY ("employee_role_id") REFERENCES "employee_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_role_permission" ADD CONSTRAINT "employee_role_permission_employee_permission_id_fkey" FOREIGN KEY ("employee_permission_id") REFERENCES "employee_permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
