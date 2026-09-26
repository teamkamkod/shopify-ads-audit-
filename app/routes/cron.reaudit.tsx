import type { ActionFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import { isRecurringMonitoringTier, planDefinition, type PlanTier } from "../billing-plans";
import { runAudit } from "../services/audit-runner.server";
import db from "../db.server";

const FREQUENCY_MS: Record<"weekly" | "daily", number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

// Called by an external scheduler (e.g. a VPS crontab hitting this route
// hourly), since Shopify has no application-side cron. One run per call
// checks every paid shop and re-audits the ones whose plan-derived
// frequency (weekly for Starter, daily for Growth/Scale) has elapsed since
// their last cron-triggered run — safe to call more often than any shop's
// actual cadence needs, it just no-ops the rest.
export const action = async ({ request }: ActionFunctionArgs) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Response("CRON_SECRET is not configured", { status: 500 });
  }
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${secret}`) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const shops = await db.shopSettings.findMany({
    where: { plan: { not: "free" } },
  });

  const results: Array<{ shop: string; status: string }> = [];

  for (const shopSettings of shops) {
    const tier = shopSettings.plan as PlanTier;
    if (!isRecurringMonitoringTier(tier)) {
      results.push({ shop: shopSettings.shop, status: "skipped-free" });
      continue;
    }

    const plan = planDefinition(tier);
    if (plan.reAuditFrequency === "none") {
      results.push({ shop: shopSettings.shop, status: "skipped-no-frequency" });
      continue;
    }

    const lastCronRun = await db.auditRun.findFirst({
      where: { shop: shopSettings.shop, triggeredBy: "cron" },
      orderBy: { createdAt: "desc" },
    });

    const dueAt = lastCronRun
      ? lastCronRun.createdAt.getTime() + FREQUENCY_MS[plan.reAuditFrequency]
      : 0;
    if (Date.now() < dueAt) {
      results.push({ shop: shopSettings.shop, status: "not-due" });
      continue;
    }

    try {
      const { admin } = await unauthenticated.admin(shopSettings.shop);
      await runAudit(admin, shopSettings.shop, {
        skuLimit: plan.skuLimit,
        triggeredBy: "cron",
      });
      results.push({ shop: shopSettings.shop, status: "audited" });
    } catch (error) {
      // One shop's failure (e.g. uninstalled app, revoked token) must not
      // block the rest of the batch.
      console.error(`cron re-audit failed for ${shopSettings.shop}:`, error);
      results.push({ shop: shopSettings.shop, status: "error" });
    }
  }

  return { checked: shops.length, results };
};
