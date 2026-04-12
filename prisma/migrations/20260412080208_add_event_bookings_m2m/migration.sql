/*
  Warnings:

  - You are about to drop the column `eventBookingId` on the `CustomerInteraction` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "CustomerInteraction" DROP CONSTRAINT "CustomerInteraction_eventBookingId_fkey";

-- DropIndex
DROP INDEX "CustomerInteraction_eventBookingId_idx";

-- AlterTable
ALTER TABLE "CustomerInteraction" DROP COLUMN "eventBookingId";

-- AlterTable
ALTER TABLE "DefaultBookingConfiguration" ALTER COLUMN "defaultStartTime" SET DEFAULT TIME '08:00:00';

-- CreateTable
CREATE TABLE "_CustomerInteractionToEventBooking" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CustomerInteractionToEventBooking_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_CustomerInteractionToEventBooking_B_index" ON "_CustomerInteractionToEventBooking"("B");

-- AddForeignKey
ALTER TABLE "_CustomerInteractionToEventBooking" ADD CONSTRAINT "_CustomerInteractionToEventBooking_A_fkey" FOREIGN KEY ("A") REFERENCES "CustomerInteraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomerInteractionToEventBooking" ADD CONSTRAINT "_CustomerInteractionToEventBooking_B_fkey" FOREIGN KEY ("B") REFERENCES "EventBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
