import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ALL_PAID_PLAN_IDS, planDefinition, tierOf } from "../billing-plans";
import { auditProduct, summarizeAudit } from "../services/audit-engine.server";
import { fetchAllProductsForAudit } from "../services/shopify-products.server";
import db from "../db.server";

const FREE_TIER_VISIBLE_ISSUES = 5;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);

  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: ALL_PAID_PLAN_IDS,
    isTest: process.env.NODE_ENV !== "production",
  });
  const tier = hasActivePayment ? tierOf(appSubscriptions[0]?.name) : "free";

  const lastRun = await db.auditRun.findFirst({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    include: { issues: true },
  });

  return { isPaid: hasActivePayment, tier, lastRun };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin, billing } = await authenticate.admin(request);

  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: ALL_PAID_PLAN_IDS,
    isTest: process.env.NODE_ENV !== "production",
  });
  const tier = hasActivePayment ? tierOf(appSubscriptions[0]?.name) : "free";
  const plan = planDefinition(tier);

  const { products, truncated } = await fetchAllProductsForAudit(admin, {
    maxProducts: plan.skuLimit ?? Infinity,
  });
  const results = products.map(auditProduct);
  const summary = summarizeAudit(results);

  await db.shopSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, plan: tier },
    update: { plan: tier },
  });

  const run = await db.auditRun.create({
    data: {
      shop: session.shop,
      scoredProducts: summary.scoredProducts,
      score: summary.score,
      blockingIssueCount: summary.blockingIssueCount,
      recommendedIssueCount: summary.recommendedIssueCount,
      adsIssueCount: summary.adsIssueCount,
      triggeredBy: "manual",
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

  return { runId: run.id, truncated, skuLimit: plan.skuLimit };
};

export default function Index() {
  const { isPaid, lastRun } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const isAuditing = fetcher.state !== "idle";

  const runAudit = () => fetcher.submit({}, { method: "POST" });

  const blockingIssues = lastRun?.issues.filter((i) => i.severity === "blocking") ?? [];
  const otherIssues = lastRun?.issues.filter((i) => i.severity !== "blocking") ?? [];

  const visibleBlockingIssues = isPaid
    ? blockingIssues
    : blockingIssues.slice(0, FREE_TIER_VISIBLE_ISSUES);

  return (
    <s-page heading="Audit ChatGPT Ads / Shopping">
      <s-button
        slot="primary-action"
        onClick={runAudit}
        {...(isAuditing ? { loading: true } : {})}
      >
        Lancer un audit
      </s-button>

      {fetcher.data?.truncated && (
        <s-banner tone="warning" heading="Catalogue partiellement audité">
          <s-paragraph>
            Votre catalogue dépasse la limite de {fetcher.data.skuLimit} SKUs de votre
            palier actuel — seuls les {fetcher.data.skuLimit} premiers produits ont été
            audités. <s-link href="/app/billing">Passez à un palier supérieur</s-link> pour
            couvrir tout votre catalogue.
          </s-paragraph>
        </s-banner>
      )}

      <s-section heading="Score de conformité">
        {lastRun ? (
          <s-stack direction="inline" gap="large" alignItems="center">
            <s-heading>{lastRun.score} / 100</s-heading>
            <s-paragraph>
              {lastRun.scoredProducts} produits analysés — {blockingIssues.length} problèmes
              bloquants, {otherIssues.length} recommandations.
            </s-paragraph>
          </s-stack>
        ) : (
          <s-paragraph>
            Aucun audit encore lancé. Cliquez sur « Lancer un audit » pour analyser votre
            catalogue.
          </s-paragraph>
        )}
      </s-section>

      {blockingIssues.length > 0 && (
        <s-section heading="Problèmes bloquants">
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
              {blockingIssues.length - FREE_TIER_VISIBLE_ISSUES} problèmes supplémentaires
              masqués. <s-link href="/app/billing">Passez à un palier payant</s-link> pour le
              rapport complet et le monitoring récurrent (le plan Free se limite à un audit
              ponctuel, sans ré-audit automatique).
            </s-paragraph>
          )}
        </s-section>
      )}

      <s-section slot="aside" heading="Ce que cet audit vérifie">
        <s-paragraph>
          La préparation de vos données produit par rapport à la spec OpenAI Commerce
          (title, description, image, prix, disponibilité, GTIN, marque, catégorie…).
        </s-paragraph>
        <s-paragraph>
          Cet audit ne vérifie pas votre statut d&apos;indexation réel dans ChatGPT ni votre
          inscription au OpenAI Merchant Program — ces informations ne sont pas accessibles
          depuis l&apos;extérieur.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
