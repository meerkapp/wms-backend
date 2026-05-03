/*
  Warnings:

  - You are about to drop the column `currency` on the `country` table. All the data in the column will be lost.
  - You are about to drop the column `retail_price` on the `product_package` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `product_shipment` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "currency_code" AS ENUM ('AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHF', 'CLP', 'CNY', 'COP', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'UYU', 'UZS', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XCD', 'XOF', 'XPF', 'YER', 'ZAR', 'ZMW', 'ZWL');

-- CreateEnum
CREATE TYPE "price_list_target_type" AS ENUM ('WAREHOUSE', 'ORGANIZATION', 'LOCALITY', 'COUNTRY');

-- AlterTable
ALTER TABLE "country" DROP COLUMN "currency";

-- AlterTable
ALTER TABLE "product_package" DROP COLUMN "retail_price";

-- AlterTable
ALTER TABLE "product_shipment" DROP COLUMN "price",
ADD COLUMN     "currency" "currency_code" NOT NULL DEFAULT 'RUB',
ADD COLUMN     "price_amount" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "price_list" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "currency" "currency_code" NOT NULL DEFAULT 'RUB',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_assignment" (
    "id" SERIAL NOT NULL,
    "price_list_id" INTEGER NOT NULL,
    "target_type" "price_list_target_type" NOT NULL,
    "warehouse_id" INTEGER,
    "organization_id" INTEGER,
    "locality_id" INTEGER,
    "country_id" INTEGER,

    CONSTRAINT "price_list_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_price" (
    "id" SERIAL NOT NULL,
    "price_list_id" INTEGER NOT NULL,
    "product_package_id" INTEGER NOT NULL,
    "price_amount" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_price_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_list_assignment_price_list_id_warehouse_id_key" ON "price_list_assignment"("price_list_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_assignment_price_list_id_organization_id_key" ON "price_list_assignment"("price_list_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_assignment_price_list_id_locality_id_key" ON "price_list_assignment"("price_list_id", "locality_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_assignment_price_list_id_country_id_key" ON "price_list_assignment"("price_list_id", "country_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_price_price_list_id_product_package_id_key" ON "product_price"("price_list_id", "product_package_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_default_price_list" ON "price_list" ("is_default") WHERE "is_default" = true;

-- AddForeignKey
ALTER TABLE "price_list_assignment" ADD CONSTRAINT "price_list_assignment_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_assignment" ADD CONSTRAINT "price_list_assignment_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_assignment" ADD CONSTRAINT "price_list_assignment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_assignment" ADD CONSTRAINT "price_list_assignment_locality_id_fkey" FOREIGN KEY ("locality_id") REFERENCES "locality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_assignment" ADD CONSTRAINT "price_list_assignment_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_price" ADD CONSTRAINT "product_price_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_price" ADD CONSTRAINT "product_price_product_package_id_fkey" FOREIGN KEY ("product_package_id") REFERENCES "product_package"("id") ON DELETE CASCADE ON UPDATE CASCADE;
