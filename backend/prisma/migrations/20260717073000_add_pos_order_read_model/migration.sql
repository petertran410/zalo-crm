-- CreateTable: POS Order Read Model
CREATE TABLE "pos_orders" (
    "id" TEXT NOT NULL,
    "pos_order_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "customer_id" INTEGER,
    "branch_id" INTEGER,
    "sold_by_id" INTEGER,
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grand_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paid_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debt_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payment_status" TEXT NOT NULL DEFAULT 'Draft',
    "order_status" TEXT NOT NULL DEFAULT 'Draft',
    "description" TEXT,
    "org_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable: POS Order Detail
CREATE TABLE "pos_order_details" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" INTEGER NOT NULL,
    "product_code" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit_price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_order_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable: POS Order Payment
CREATE TABLE "pos_order_payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "pos_payment_id" INTEGER,
    "amount" DOUBLE PRECISION NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_method" TEXT NOT NULL DEFAULT 'cash',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_orders_pos_order_id_key" ON "pos_orders"("pos_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_orders_code_key" ON "pos_orders"("code");

-- CreateIndex
CREATE INDEX "pos_orders_org_id_idx" ON "pos_orders"("org_id");

-- CreateIndex
CREATE INDEX "pos_orders_code_idx" ON "pos_orders"("code");

-- CreateIndex
CREATE INDEX "pos_orders_contact_id_idx" ON "pos_orders"("contact_id");

-- CreateIndex
CREATE INDEX "pos_orders_created_at_idx" ON "pos_orders"("created_at");

-- CreateIndex
CREATE INDEX "pos_order_details_order_id_idx" ON "pos_order_details"("order_id");

-- CreateIndex
CREATE INDEX "pos_order_payments_order_id_idx" ON "pos_order_payments"("order_id");

-- AddForeignKey
ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_order_details" ADD CONSTRAINT "pos_order_details_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "pos_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_order_payments" ADD CONSTRAINT "pos_order_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "pos_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
