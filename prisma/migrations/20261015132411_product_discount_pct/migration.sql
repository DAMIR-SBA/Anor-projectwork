-- DropIndex
DROP INDEX "Product_searchText_trgm_idx";

-- DropIndex
DROP INDEX "SearchQuery_query_trgm_idx";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "discountPct" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Product_status_discountPct_idx" ON "Product"("status", "discountPct");

-- CreateIndex
CREATE INDEX "Product_status_rating_idx" ON "Product"("status", "rating");
