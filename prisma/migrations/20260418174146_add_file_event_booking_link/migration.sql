-- AlterTable
ALTER TABLE "DefaultBookingConfiguration" ALTER COLUMN "defaultStartTime" SET DEFAULT TIME '08:00:00';

-- AlterTable
ALTER TABLE "File" ADD COLUMN     "eventBookingId" TEXT;

-- CreateIndex
CREATE INDEX "File_eventBookingId_idx" ON "File"("eventBookingId");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_eventBookingId_fkey" FOREIGN KEY ("eventBookingId") REFERENCES "EventBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
