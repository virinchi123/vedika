/*
  Warnings:

  - You are about to drop the column `commissionAmount` on the `Service` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DefaultBookingConfiguration" ALTER COLUMN "defaultStartTime" SET DEFAULT TIME '08:00:00';

-- AlterTable
ALTER TABLE "Service" DROP COLUMN "commissionAmount",
ADD COLUMN     "commissionPaidAmount" DECIMAL(10,2),
ADD COLUMN     "customerPaidAmount" DECIMAL(10,2),
ADD COLUMN     "deduction" DECIMAL(10,2),
ADD COLUMN     "grossCommission" DECIMAL(10,2);
