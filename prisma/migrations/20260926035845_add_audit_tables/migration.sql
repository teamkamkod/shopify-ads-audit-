-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scoredProducts" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "blockingIssueCount" INTEGER NOT NULL,
    "recommendedIssueCount" INTEGER NOT NULL,
    "adsIssueCount" INTEGER NOT NULL,
    "triggeredBy" TEXT NOT NULL DEFAULT 'manual',
    CONSTRAINT "AuditRun_shop_fkey" FOREIGN KEY ("shop") REFERENCES "ShopSettings" ("shop") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditRunId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "openaiField" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditIssue_auditRunId_fkey" FOREIGN KEY ("auditRunId") REFERENCES "AuditRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AuditRun_shop_createdAt_idx" ON "AuditRun"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "AuditIssue_auditRunId_idx" ON "AuditIssue"("auditRunId");
