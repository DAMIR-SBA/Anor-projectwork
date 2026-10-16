-- DropIndex
DROP INDEX "Variant_barcode_key";

-- CreateIndex
CREATE INDEX "Variant_barcode_idx" ON "Variant"("barcode");
