/*
  Warnings:

  - You are about to drop the column `stock_id` on the `employee` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "employee" DROP COLUMN "stock_id",
ADD COLUMN     "warehouse_id" INTEGER;

-- CreateTable
CREATE TABLE "country" (
    "id" SERIAL NOT NULL,
    "code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "city" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "country_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "city_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse" (
    "id" SERIAL NOT NULL,
    "address" TEXT NOT NULL,
    "note" TEXT,
    "code" TEXT NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "city_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "country_code_key" ON "country"("code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_code_key" ON "warehouse"("code");

-- AddForeignKey
ALTER TABLE "city" ADD CONSTRAINT "city_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse" ADD CONSTRAINT "warehouse_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse" ADD CONSTRAINT "warehouse_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "city"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
