import { auditProduct, summarizeAudit } from "./audit-engine.server";
import { fetchAllProductsForAudit, type ProductFetchResult } from "./shopify-products.server";
import { sendBlockingIssuesAlert } from "./mailer.server";
import db from "../db.server";

interface AdminGraphqlClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

// Shared by the manual "Lancer un audit" action (app._index.tsx) and the
// external cron endpoint (routes/cron.reaudit.tsx) — one place to keep the
// fetch → score → persist pipeline consistent between the two triggers.
export async function runAudit(
  admin: AdminGraphqlClient,
  shop: string,
  {
    skuLimit,
    triggeredBy,
  }: { skuLimit: number | null; triggeredBy: "manual" | "cron" | "webhook" },
): Promise<{ runId: string; truncated: boolean } & Pick<ProductFetchResult, "products">> {
  const { products, truncated } = await fetchAllProductsForAudit(admin, {
    maxProducts: skuLimit ?? Infinity,
  });
  const results = products.map(auditProduct);
  const summary = summarizeAudit(results);

  const run = await db.auditRun.create({
    data: {
      shop,
      scoredProducts: summary.scoredProducts,
      score: summary.score,
      blockingIssueCount: summary.blockingIssueCount,
      recommendedIssueCount: summary.recommendedIssueCount,
      adsIssueCount: summary.adsIssueCount,
      triggeredBy,
      issues: {
        create: summary.results.flatMap((r) =>
          r.issues.map((issue) => ({
            productId: r.productId,
            productTitle: r.title,
            fieldId: issue.fieldId,
            openaiField: issue.openaiField,
            severity: issue.severity,
            message: issue.message,
          })),
        ),
      },
    },
  });

  // Alerting is a paid-tier feature and only applies to recurring
  // monitoring, never a manual one-off audit — cron and webhook triggers
  // are already scoped to paid plans upstream (cron.reaudit.tsx only
  // processes non-free shops; webhooks.products.update.tsx no-ops on Free).
  if (triggeredBy !== "manual" && summary.blockingIssueCount > 0) {
    await sendBlockingIssuesAlert(admin, shop, {
      scoredProducts: summary.scoredProducts,
      blockingIssues: summary.results.flatMap((r) =>
        r.issues
          .filter((issue) => issue.severity === "blocking")
          .map((issue) => ({ productTitle: r.title, message: issue.message })),
      ),
    });
  }

  return { runId: run.id, truncated, products };
}
