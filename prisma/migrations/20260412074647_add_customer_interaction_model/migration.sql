-- CreateEnum
CREATE TYPE "CustomerInteractionType" AS ENUM ('WALK_IN', 'PHONE_IN', 'MISSED_CALL');

-- AlterTable
ALTER TABLE "DefaultBookingConfiguration" ALTER COLUMN "defaultStartTime" SET DEFAULT TIME '08:00:00';

-- CreateTable
CREATE TABLE "CustomerInteraction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "interactionType" "CustomerInteractionType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "eventBookingId" TEXT,

    CONSTRAINT "CustomerInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerInteraction_eventBookingId_idx" ON "CustomerInteraction"("eventBookingId");

-- AddForeignKey
ALTER TABLE "CustomerInteraction" ADD CONSTRAINT "CustomerInteraction_eventBookingId_fkey" FOREIGN KEY ("eventBookingId") REFERENCES "EventBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
