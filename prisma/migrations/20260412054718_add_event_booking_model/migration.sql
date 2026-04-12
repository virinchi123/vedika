-- CreateEnum
CREATE TYPE "EventBookingMode" AS ENUM ('PHONE_IN', 'WALK_IN');

-- AlterTable
ALTER TABLE "DefaultBookingConfiguration" ALTER COLUMN "defaultStartTime" SET DEFAULT TIME '08:00:00';

-- CreateTable
CREATE TABLE "EventBooking" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mode" "EventBookingMode" NOT NULL,
    "bookingStatusId" TEXT NOT NULL,
    "eventStatusId" TEXT NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "bookingStart" TIMESTAMP(3) NOT NULL,
    "bookingEnd" TIMESTAMP(3) NOT NULL,
    "muhurat" TIMESTAMP(3),
    "customerName" TEXT NOT NULL,
    "phoneNumber1" TEXT NOT NULL,
    "phoneNumber2" TEXT,
    "phoneNumber3" TEXT,
    "referredBy" TEXT,

    CONSTRAINT "EventBooking_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EventBooking" ADD CONSTRAINT "EventBooking_bookingStatusId_fkey" FOREIGN KEY ("bookingStatusId") REFERENCES "BookingStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventBooking" ADD CONSTRAINT "EventBooking_eventStatusId_fkey" FOREIGN KEY ("eventStatusId") REFERENCES "EventStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventBooking" ADD CONSTRAINT "EventBooking_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
