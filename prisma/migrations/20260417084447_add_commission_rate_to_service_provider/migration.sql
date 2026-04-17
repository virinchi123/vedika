/*
  Warnings:

  - Added the required column `commissionRate` to the `ServiceProvider` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DefaultBookingConfiguration" ALTER COLUMN "defaultStartTime" SET DEFAULT TIME '08:00:00';

-- AlterTable
ALTER TABLE "ServiceProvider" ADD COLUMN     "commissionRate" DOUBLE PRECISION NOT NULL;
