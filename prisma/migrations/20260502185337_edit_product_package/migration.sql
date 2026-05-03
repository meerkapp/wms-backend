/*
  Warnings:

  - A unique constraint covering the columns `[product_item_id,name]` on the table `product_package` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "product_package" ADD COLUMN     "is_base" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "name" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "product_package_product_item_id_name_key" ON "product_package"("product_item_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "one_base_package_per_product" ON "product_package" ("product_item_id") WHERE "is_base" = true;
