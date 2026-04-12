-- AlterTable
ALTER TABLE "DefaultBookingConfiguration" ALTER COLUMN "defaultStartTime" SET DEFAULT TIME '08:00:00';

-- CreateTable
CREATE TABLE "_EventBookingToServiceProvider" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EventBookingToServiceProvider_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_EventBookingToServiceProvider_B_index" ON "_EventBookingToServiceProvider"("B");

-- AddForeignKey
ALTER TABLE "_EventBookingToServiceProvider" ADD CONSTRAINT "_EventBookingToServiceProvider_A_fkey" FOREIGN KEY ("A") REFERENCES "EventBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EventBookingToServiceProvider" ADD CONSTRAINT "_EventBookingToServiceProvider_B_fkey" FOREIGN KEY ("B") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
