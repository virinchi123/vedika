/*
  Warnings:

  - You are about to drop the column `checksum` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `contentType` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `size` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `version` on the `File` table. All the data in the column will be lost.
  - Added the required column `extension` to the `File` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "File_checksum_key";

-- AlterTable
ALTER TABLE "DefaultBookingConfiguration" ALTER COLUMN "defaultStartTime" SET DEFAULT TIME '08:00:00';

-- AlterTable
ALTER TABLE "File" DROP COLUMN "checksum",
DROP COLUMN "contentType",
DROP COLUMN "size",
DROP COLUMN "version",
ADD COLUMN     "extension" TEXT NOT NULL;
