-- CreateTable
CREATE TABLE "DefaultBookingConfiguration" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "defaultStartTime" TIME NOT NULL DEFAULT TIME '08:00:00',
    "defaultDurationInMinutes" INTEGER NOT NULL DEFAULT 240,

    CONSTRAINT "DefaultBookingConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DefaultBookingConfiguration_eventTypeId_key" ON "DefaultBookingConfiguration"("eventTypeId");

-- AddForeignKey
ALTER TABLE "DefaultBookingConfiguration" ADD CONSTRAINT "DefaultBookingConfiguration_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
