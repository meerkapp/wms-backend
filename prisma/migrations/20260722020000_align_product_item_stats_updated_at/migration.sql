-- Prisma manages this field through @updatedAt, while database functions that
-- write stats already provide updated_at explicitly. Keep the database schema
-- aligned with the Prisma datamodel to avoid persistent migration drift.
ALTER TABLE "product_item_stats"
ALTER COLUMN "updated_at" DROP DEFAULT;
