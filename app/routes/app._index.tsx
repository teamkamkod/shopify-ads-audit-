import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify-auth.server";
import { ALL_PAID_PLAN_IDS, planDefinition, tierOf } from "../billing-plans";
import { runAudit } from "../services/audit-runner.server";
import { resolveEffectiveTier } from "../services/shop-links.server";
import db from "../db.server";

const FREE_TIER_VISIBLE_ISSUES = 5;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);

  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: ALL_PAID_PLAN_IDS,
    isTest: process.env.NODE_ENV !== "production",
  });
  const ownTier = hasActivePayment ? tierOf(appSubscriptions[0]?.name) : "free";
  // Folds in an inherited Scale tier for a shop linked to another shop's
  // subscription — its own billing.check legitimately reports no payment.
  const tier = await resolveEffectiveTier(session.shop, ownTier);

  const lastRun = await db.auditRun.findFirst({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    include: { issues: true },
  });

  return {
    isPaid: tier !== "free",
    tier,
    lastRun,
    csvExport: planDefinition(tier).csvExport,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin, billing } = await authenticate.admin(request);

  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: ALL_PAID_PLAN_IDS,
    isTest: process.env.NODE_ENV !== "production",
  });
  const ownTier = hasActivePayment ? tierOf(appSubscriptions[0]?.name) : "free";
  const tier = await resolveEffectiveTier(session.shop, ownTier);
  const plan = planDefinition(tier);

  await db.shopSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, plan: tier },
    update: { plan: tier },
  });

  const { runId, truncated } = await runAudit(admin, session.shop, {
    skuLimit: plan.skuLimit,
    triggeredBy: "manual",
  });

  return { runId, truncated, skuLimit: plan.skuLimit };
};

export default function Index() {
  const { isPaid, lastRun, csvExport } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const isAuditing = fetcher.state !== "idle";

  const runAudit = () => fetcher.submit({}, { method: "POST" });

  const blockingIssues = lastRun?.issues.filter((i) => i.severity === "blocking") ?? [];
  const otherIssues = lastRun?.issues.filter((i) => i.severity !== "blocking") ?? [];

  const visibleBlockingIssues = isPaid
    ? blockingIssues
    : blockingIssues.slice(0, FREE_TIER_VISIBLE_ISSUES);

  return (
    <s-page heading="ChatGPT Ads / Shopping audit">
      <s-button
        slot="primary-action"
        onClick={runAudit}
        {...(isAuditing ? { loading: true } : {})}
      >
        Run audit
      </s-button>

      {fetcher.data?.truncated && (
        <s-banner tone="warning" heading="Catalog only partially audited">
          <s-paragraph>
            Your catalog exceeds the {fetcher.data.skuLimit} SKU limit of your current plan —
            only the first {fetcher.data.skuLimit} products were audited.{" "}
            <s-link href="/app/billing">Upgrade your plan</s-link> to cover your full catalog.
          </s-paragraph>
        </s-banner>
      )}

      <s-section heading="Compliance score">
        {lastRun ? (
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="large" alignItems="center">
              <s-heading>{lastRun.score} / 100</s-heading>
              <s-paragraph>
                {lastRun.scoredProducts} products analyzed — {blockingIssues.length} blocking
                issues, {otherIssues.length} recommendations.
              </s-paragraph>
            </s-stack>
            {csvExport ? (
              <s-link href="/app/export-csv">Export the latest audit as CSV</s-link>
            ) : (
              <s-paragraph>
                <s-link href="/app/billing">Upgrade to Growth or Scale</s-link> to export your
                audits as CSV.
              </s-paragraph>
            )}
          </s-stack>
        ) : (
          <s-paragraph>
            No audit has been run yet. Select &quot;Run audit&quot; to analyze your catalog.
          </s-paragraph>
        )}
      </s-section>

      {blockingIssues.length > 0 && (
        <s-section heading="Blocking issues">
          <s-stack direction="block" gap="base">
            {visibleBlockingIssues.map((issue) => (
              <s-box key={issue.id} padding="small" borderWidth="base" borderRadius="base">
                <s-paragraph>
                  <strong>{issue.productTitle}</strong> — {issue.message}
                </s-paragraph>
              </s-box>
            ))}
          </s-stack>
          {!isPaid && blockingIssues.length > FREE_TIER_VISIBLE_ISSUES && (
            <s-paragraph>
              {blockingIssues.length - FREE_TIER_VISIBLE_ISSUES} more issues hidden.{" "}
              <s-link href="/app/billing">Upgrade to a paid plan</s-link> for the full report and
              recurring monitoring (the Free plan is limited to a one-time audit, with no
              automatic re-audit).
            </s-paragraph>
          )}
        </s-section>
      )}

      <s-section slot="aside" heading="What this audit checks">
        <s-paragraph>
          How ready your product data is for the OpenAI Commerce spec (title, description, image,
          price, availability, GTIN, brand, category…).
        </s-paragraph>
        <s-paragraph>
          This audit does not check your actual indexing status in ChatGPT or your enrollment in
          the OpenAI Merchant Program — that information is not accessible from the outside.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
