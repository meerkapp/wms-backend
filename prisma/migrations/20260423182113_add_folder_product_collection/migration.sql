-- CreateTable
CREATE TABLE "folder" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_collection" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "folder_id" INTEGER,
    "default_product_type_id" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_collection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_collection_folder_id_name_key" ON "product_collection"("folder_id", "name");

-- AddForeignKey
ALTER TABLE "folder" ADD CONSTRAINT "folder_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "folder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_collection" ADD CONSTRAINT "product_collection_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_collection" ADD CONSTRAINT "product_collection_default_product_type_id_fkey" FOREIGN KEY ("default_product_type_id") REFERENCES "product_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
