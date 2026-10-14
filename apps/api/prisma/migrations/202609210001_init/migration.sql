CREATE TYPE "PlatformType" AS ENUM ('ECOMMERCE','QUICK_COMMERCE','FOOD_DELIVERY');
CREATE TABLE "Platform" (
 "id" TEXT NOT NULL, "name" TEXT NOT NULL, "slug" TEXT NOT NULL, "type" "PlatformType" NOT NULL,
 "baseUrl" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Platform_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CanonicalProduct" (
 "id" TEXT NOT NULL, "title" TEXT NOT NULL, "normalizedTitle" TEXT NOT NULL,
 "brand" TEXT, "category" TEXT NOT NULL, "unitValue" DECIMAL(12,3), "unit" TEXT, "imageUrl" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CanonicalProduct_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PlatformPosting" (
 "id" TEXT NOT NULL, "platformId" TEXT NOT NULL, "canonicalProductId" TEXT NOT NULL,
 "externalId" TEXT NOT NULL, "locationKey" TEXT NOT NULL, "title" TEXT NOT NULL, "productUrl" TEXT, "imageUrl" TEXT,
 "price" DECIMAL(12,2) NOT NULL, "deliveryFee" DECIMAL(12,2), "handlingFee" DECIMAL(12,2), "platformFee" DECIMAL(12,2),
 "etaMinutes" INTEGER, "available" BOOLEAN NOT NULL, "pincode" TEXT NOT NULL,
 "latitude" DECIMAL(9,6) NOT NULL, "longitude" DECIMAL(9,6) NOT NULL,
 "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PlatformPosting_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PlatformPosting_price_check" CHECK ("price" >= 0),
 CONSTRAINT "PlatformPosting_fees_check" CHECK (COALESCE("deliveryFee",0) >= 0 AND COALESCE("handlingFee",0) >= 0 AND COALESCE("platformFee",0) >= 0),
 CONSTRAINT "PlatformPosting_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
 CONSTRAINT "PlatformPosting_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180),
 CONSTRAINT "PlatformPosting_eta_check" CHECK ("etaMinutes" IS NULL OR "etaMinutes" >= 0)
);
CREATE UNIQUE INDEX "Platform_slug_key" ON "Platform"("slug");
CREATE INDEX "CanonicalProduct_normalizedTitle_idx" ON "CanonicalProduct"("normalizedTitle");
CREATE INDEX "CanonicalProduct_brand_category_idx" ON "CanonicalProduct"("brand","category");
CREATE UNIQUE INDEX "PlatformPosting_platformId_externalId_locationKey_key" ON "PlatformPosting"("platformId","externalId","locationKey");
CREATE INDEX "PlatformPosting_canonicalProductId_pincode_available_idx" ON "PlatformPosting"("canonicalProductId","pincode","available");
CREATE INDEX "PlatformPosting_lastFetchedAt_idx" ON "PlatformPosting"("lastFetchedAt");
ALTER TABLE "PlatformPosting" ADD CONSTRAINT "PlatformPosting_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformPosting" ADD CONSTRAINT "PlatformPosting_canonicalProductId_fkey" FOREIGN KEY ("canonicalProductId") REFERENCES "CanonicalProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
