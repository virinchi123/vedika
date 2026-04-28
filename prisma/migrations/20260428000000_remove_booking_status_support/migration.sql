ALTER TABLE "EventBooking" DROP CONSTRAINT "EventBooking_bookingStatusId_fkey";

ALTER TABLE "EventBooking" DROP COLUMN "bookingStatusId";

DROP TABLE "BookingStatus";
