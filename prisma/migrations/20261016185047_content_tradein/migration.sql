-- AlterEnum
ALTER TYPE "WalletTxType" ADD VALUE 'TRADE_IN';

-- AlterTable
ALTER TABLE "LiveChatMessage" ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LiveStream" ADD COLUMN     "currentProductId" TEXT,
ADD COLUMN     "likes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "peakViewers" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ShortVideo" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "TradeInRequest" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "imeiLast4" TEXT,
ADD COLUMN     "number" TEXT NOT NULL,
ADD COLUMN     "offeredValue" INTEGER,
ADD COLUMN     "photos" TEXT[],
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "staffNote" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "ShortVideo_isActive_createdAt_idx" ON "ShortVideo"("isActive", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TradeInRequest_number_key" ON "TradeInRequest"("number");

-- CreateIndex
CREATE INDEX "TradeInRequest_status_createdAt_idx" ON "TradeInRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TradeInRequest_userId_createdAt_idx" ON "TradeInRequest"("userId", "createdAt");

