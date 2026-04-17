-- AlterTable
ALTER TABLE "CallRecord" ADD COLUMN     "customerInteractionId" TEXT;

-- AlterTable
ALTER TABLE "DefaultBookingConfiguration" ALTER COLUMN "defaultStartTime" SET DEFAULT TIME '08:00:00';

-- CreateTable
CREATE TABLE "VoiceNote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fileId" TEXT NOT NULL,
    "customerInteractionId" TEXT NOT NULL,

    CONSTRAINT "VoiceNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceNote_fileId_idx" ON "VoiceNote"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceNote_customerInteractionId_key" ON "VoiceNote"("customerInteractionId");

-- CreateIndex
CREATE INDEX "CallRecord_customerInteractionId_idx" ON "CallRecord"("customerInteractionId");

-- AddForeignKey
ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_customerInteractionId_fkey" FOREIGN KEY ("customerInteractionId") REFERENCES "CustomerInteraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceNote" ADD CONSTRAINT "VoiceNote_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceNote" ADD CONSTRAINT "VoiceNote_customerInteractionId_fkey" FOREIGN KEY ("customerInteractionId") REFERENCES "CustomerInteraction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
