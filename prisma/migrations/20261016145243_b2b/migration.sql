-- AlterEnum
ALTER TYPE "QuoteStatus" ADD VALUE 'ORDERED';

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "quoteId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "paidById" TEXT,
ADD COLUMN     "paidRef" TEXT,
ADD COLUMN     "requisites" JSONB;

-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "number" TEXT NOT NULL,
ADD COLUMN     "variantId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_quoteId_key" ON "CartItem"("quoteId");

-- CreateIndex
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_number_key" ON "QuoteRequest"("number");

-- CreateIndex
CREATE INDEX "QuoteRequest_shopId_status_idx" ON "QuoteRequest"("shopId", "status");

-- CreateIndex
CREATE INDEX "QuoteRequest_userId_createdAt_idx" ON "QuoteRequest"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "QuoteRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

