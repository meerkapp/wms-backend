-- CreateTable
CREATE TABLE "employee" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "stock_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_role" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_permission" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "setup_completed" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "server_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_role_assignment" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" UUID NOT NULL,
    "employee_role_id" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_role_permission" (
    "id" BIGSERIAL NOT NULL,
    "employee_role_id" BIGINT NOT NULL,
    "employee_permission_id" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_role_permission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_email_key" ON "employee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employee_role_name_key" ON "employee_role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employee_permission_name_key" ON "employee_permission"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employee_role_assignment_employee_id_employee_role_id_key" ON "employee_role_assignment"("employee_id", "employee_role_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_role_permission_employee_role_id_employee_permissi_key" ON "employee_role_permission"("employee_role_id", "employee_permission_id");

-- AddForeignKey
ALTER TABLE "employee_role_assignment" ADD CONSTRAINT "employee_role_assignment_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_role_assignment" ADD CONSTRAINT "employee_role_assignment_employee_role_id_fkey" FOREIGN KEY ("employee_role_id") REFERENCES "employee_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_role_permission" ADD CONSTRAINT "employee_role_permission_employee_role_id_fkey" FOREIGN KEY ("employee_role_id") REFERENCES "employee_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_role_permission" ADD CONSTRAINT "employee_role_permission_employee_permission_id_fkey" FOREIGN KEY ("employee_permission_id") REFERENCES "employee_permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
