-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN "primaryShopDomain" TEXT;

-- CreateTable
CREATE TABLE "ShopLinkInvite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "primaryShop" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedByShop" TEXT,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "ShopLinkInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopLinkInvite_code_key" ON "ShopLinkInvite"("code");

-- CreateIndex
CREATE INDEX "ShopLinkInvite_primaryShop_idx" ON "ShopLinkInvite"("primaryShop");

-- AddForeignKey
ALTER TABLE "ShopSettings" ADD CONSTRAINT "ShopSettings_primaryShopDomain_fkey" FOREIGN KEY ("primaryShopDomain") REFERENCES "ShopSettings"("shop") ON DELETE SET NULL ON UPDATE CASCADE;
