-- AlterTable
ALTER TABLE "folder" DROP COLUMN "sort_order",
ADD COLUMN     "pin_order" INTEGER,
ADD COLUMN     "pinned_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "product_collection" DROP COLUMN "sort_order",
ADD COLUMN     "pin_order" INTEGER,
ADD COLUMN     "pinned_at" TIMESTAMP(3);
