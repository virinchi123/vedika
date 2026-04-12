-- CreateEnum
CREATE TYPE "FollowupType" AS ENUM ('BOOKING', 'SERVICE');

-- AlterTable
ALTER TABLE "DefaultBookingConfiguration" ALTER COLUMN "defaultStartTime" SET DEFAULT TIME '08:00:00';

-- CreateTable
CREATE TABLE "Followup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "type" "FollowupType" NOT NULL,
    "description" TEXT,
    "eventBookingId" TEXT,
    "serviceProviderId" TEXT,
    "customerInteractionId" TEXT,

    CONSTRAINT "Followup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Followup_dueDate_idx" ON "Followup"("dueDate");

-- CreateIndex
CREATE INDEX "Followup_type_dueDate_idx" ON "Followup"("type", "dueDate");

-- CreateIndex
CREATE INDEX "Followup_eventBookingId_idx" ON "Followup"("eventBookingId");

-- CreateIndex
CREATE INDEX "Followup_serviceProviderId_idx" ON "Followup"("serviceProviderId");

-- CreateIndex
CREATE INDEX "Followup_customerInteractionId_idx" ON "Followup"("customerInteractionId");

-- AddForeignKey
ALTER TABLE "Followup" ADD CONSTRAINT "Followup_eventBookingId_fkey" FOREIGN KEY ("eventBookingId") REFERENCES "EventBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Followup" ADD CONSTRAINT "Followup_serviceProviderId_fkey" FOREIGN KEY ("serviceProviderId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Followup" ADD CONSTRAINT "Followup_customerInteractionId_fkey" FOREIGN KEY ("customerInteractionId") REFERENCES "CustomerInteraction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
