-- CreateEnum
CREATE TYPE "WriteoffStrategy" AS ENUM ('FIFO', 'LIFO', 'FEFO', 'MANUAL');

-- CreateEnum
CREATE TYPE "SkuMode" AS ENUM ('GLOBAL', 'CUSTOM');

-- CreateTable
CREATE TABLE "product_type" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "default_writeoff_strategy" "WriteoffStrategy" NOT NULL DEFAULT 'FIFO',
    "sku_mode" "SkuMode" NOT NULL DEFAULT 'GLOBAL',
    "sku_template" TEXT,
    "sku_counter" INTEGER NOT NULL DEFAULT 0,
    "characteristics_scheme" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_type_pkey" PRIMARY KEY ("id")
);
