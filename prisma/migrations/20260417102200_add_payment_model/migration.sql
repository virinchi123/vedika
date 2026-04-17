-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI');

-- AlterTable
ALTER TABLE "DefaultBookingConfiguration" ALTER COLUMN "defaultStartTime" SET DEFAULT TIME '08:00:00';

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "date" DATE NOT NULL,
    "serviceId" TEXT NOT NULL,
    "paymentProofFileId" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_serviceId_idx" ON "Payment"("serviceId");

-- CreateIndex
CREATE INDEX "Payment_paymentProofFileId_idx" ON "Payment"("paymentProofFileId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentProofFileId_fkey" FOREIGN KEY ("paymentProofFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;
