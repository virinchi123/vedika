-- AlterTable
ALTER TABLE "DefaultBookingConfiguration" ALTER COLUMN "defaultStartTime" SET DEFAULT TIME '08:00:00';

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "serviceProviderId" TEXT NOT NULL,
    "eventBookingId" TEXT NOT NULL,
    "contractedAmount" DECIMAL(10,2),
    "commissionAmount" DECIMAL(10,2),

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Service_serviceProviderId_idx" ON "Service"("serviceProviderId");

-- CreateIndex
CREATE INDEX "Service_eventBookingId_idx" ON "Service"("eventBookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_serviceProviderId_eventBookingId_key" ON "Service"("serviceProviderId", "eventBookingId");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_serviceProviderId_fkey" FOREIGN KEY ("serviceProviderId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_eventBookingId_fkey" FOREIGN KEY ("eventBookingId") REFERENCES "EventBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
