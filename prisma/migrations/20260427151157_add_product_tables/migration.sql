-- CreateEnum
CREATE TYPE "barcode_type" AS ENUM ('FACTORY', 'CUSTOM');

-- CreateTable
CREATE TABLE "product_measure" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "code" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_measure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_brand" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_item" (
    "id" SERIAL NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product_collection_id" INTEGER,
    "product_type_id" INTEGER NOT NULL,
    "product_brand_id" INTEGER,
    "product_measure_id" INTEGER,
    "country_id" INTEGER,
    "characteristics" JSONB NOT NULL DEFAULT '{}',
    "writeoff_strategy" "WriteoffStrategy",
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_barcode" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "type" "barcode_type" NOT NULL DEFAULT 'FACTORY',
    "product_item_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_barcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_package" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "product_item_id" INTEGER NOT NULL,
    "conversion_factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "retail_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_shipment" (
    "id" SERIAL NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "product_item_id" INTEGER NOT NULL,
    "arrival_date" TIMESTAMP(3) NOT NULL,
    "expiry_date" DATE,
    "quantity" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_shipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_measure_name_key" ON "product_measure"("name");

-- CreateIndex
CREATE UNIQUE INDEX "product_measure_code_key" ON "product_measure"("code");

-- CreateIndex
CREATE UNIQUE INDEX "product_brand_name_key" ON "product_brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "product_item_sku_key" ON "product_item"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_barcode_code_type_key" ON "product_barcode"("code", "type");

-- AddForeignKey
ALTER TABLE "product_item" ADD CONSTRAINT "product_item_product_collection_id_fkey" FOREIGN KEY ("product_collection_id") REFERENCES "product_collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_item" ADD CONSTRAINT "product_item_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "product_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_item" ADD CONSTRAINT "product_item_product_brand_id_fkey" FOREIGN KEY ("product_brand_id") REFERENCES "product_brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_item" ADD CONSTRAINT "product_item_product_measure_id_fkey" FOREIGN KEY ("product_measure_id") REFERENCES "product_measure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_item" ADD CONSTRAINT "product_item_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_barcode" ADD CONSTRAINT "product_barcode_product_item_id_fkey" FOREIGN KEY ("product_item_id") REFERENCES "product_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_package" ADD CONSTRAINT "product_package_product_item_id_fkey" FOREIGN KEY ("product_item_id") REFERENCES "product_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_shipment" ADD CONSTRAINT "product_shipment_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_shipment" ADD CONSTRAINT "product_shipment_product_item_id_fkey" FOREIGN KEY ("product_item_id") REFERENCES "product_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
