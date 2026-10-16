-- CreateTable
CREATE TABLE "FlagExposure" (
    "flagKey" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "revenue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlagExposure_pkey" PRIMARY KEY ("flagKey","visitorId")
);

-- CreateIndex
CREATE INDEX "FlagExposure_flagKey_variant_idx" ON "FlagExposure"("flagKey", "variant");

-- AddForeignKey
ALTER TABLE "FlagExposure" ADD CONSTRAINT "FlagExposure_flagKey_fkey" FOREIGN KEY ("flagKey") REFERENCES "FeatureFlag"("key") ON DELETE CASCADE ON UPDATE CASCADE;
