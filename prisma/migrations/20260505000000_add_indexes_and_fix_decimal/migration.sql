-- AlterTable: product_shipment.quantity DECIMAL(8,2) -> DECIMAL(12,3)
ALTER TABLE "product_shipment" ALTER COLUMN "quantity" TYPE DECIMAL(12,3);

-- CreateIndex: FK indexes for product_item
CREATE INDEX "product_item_product_collection_id_idx" ON "product_item"("product_collection_id");
CREATE INDEX "product_item_product_type_id_idx" ON "product_item"("product_type_id");

-- CreateIndex: FK indexes for product_shipment
CREATE INDEX "product_shipment_warehouse_id_idx" ON "product_shipment"("warehouse_id");
CREATE INDEX "product_shipment_product_item_id_idx" ON "product_shipment"("product_item_id");

-- CreateIndex: FK indexes for product_package
CREATE INDEX "product_package_product_item_id_idx" ON "product_package"("product_item_id");

-- CreateIndex: FK indexes for product_barcode
CREATE INDEX "product_barcode_product_item_id_idx" ON "product_barcode"("product_item_id");

-- CreateIndex: FK indexes for product_price
CREATE INDEX "product_price_price_list_id_idx" ON "product_price"("price_list_id");
CREATE INDEX "product_price_product_package_id_idx" ON "product_price"("product_package_id");

-- CreateIndex: FK indexes for price_list_assignment
CREATE INDEX "price_list_assignment_price_list_id_idx" ON "price_list_assignment"("price_list_id");

-- CreateIndex: FK indexes for product_collection
CREATE INDEX "product_collection_folder_id_idx" ON "product_collection"("folder_id");

-- CreateIndex: FK indexes for product_item_stats
CREATE INDEX "product_item_stats_warehouse_id_idx" ON "product_item_stats"("warehouse_id");

-- CreateIndex: FK indexes for warehouse
CREATE INDEX "warehouse_organization_id_idx" ON "warehouse"("organization_id");
CREATE INDEX "warehouse_locality_id_idx" ON "warehouse"("locality_id");
