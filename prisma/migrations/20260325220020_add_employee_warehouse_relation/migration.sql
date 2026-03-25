-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
