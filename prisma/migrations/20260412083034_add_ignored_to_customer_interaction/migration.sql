-- AlterTable
ALTER TABLE "CustomerInteraction" ADD COLUMN     "ignored" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DefaultBookingConfiguration" ALTER COLUMN "defaultStartTime" SET DEFAULT TIME '08:00:00';
