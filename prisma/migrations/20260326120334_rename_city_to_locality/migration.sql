/*
  Warnings:

  - You are about to drop the column `city_id` on the `warehouse` table. All the data in the column will be lost.
  - You are about to drop the `city` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `locality_id` to the `warehouse` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "city" DROP CONSTRAINT "city_country_id_fkey";

-- DropForeignKey
ALTER TABLE "warehouse" DROP CONSTRAINT "warehouse_city_id_fkey";

-- AlterTable
ALTER TABLE "warehouse" DROP COLUMN "city_id",
ADD COLUMN     "locality_id" INTEGER NOT NULL;

-- DropTable
DROP TABLE "city";

-- CreateTable
CREATE TABLE "locality" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "country_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locality_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "locality" ADD CONSTRAINT "locality_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse" ADD CONSTRAINT "warehouse_locality_id_fkey" FOREIGN KEY ("locality_id") REFERENCES "locality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
