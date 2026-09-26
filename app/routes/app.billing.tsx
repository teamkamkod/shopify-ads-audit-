import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  ALL_PAID_PLAN_IDS,
  ANNUAL_DISCOUNT_RATE,
  PLAN_CATALOG,
  TRIAL_DAYS,
  tierOf,
  type BillingIntervalChoice,
} from "../billing-plans";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);

  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: ALL_PAID_PLAN_IDS,
    isTest: process.env.NODE_ENV !== "production",
  });

  const currentTier = hasActivePayment ? tierOf(appSubscriptions[0]?.name) : "free";

  // Persisted so the products/update webhook handler can check the plan
  // without calling the Billing API on every product change.
  await db.shopSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, plan: currentTier },
    update: { plan: currentTier },
  });

  const url = new URL(request.url);
  const interval: BillingIntervalChoice =
    url.searchParams.get("interval") === "annual" ? "annual" : "monthly";

  return { currentTier, interval };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const planId = formData.get("plan");

  if (planId === "Free") {
    // Downgrading: cancel any active paid subscription.
    const { appSubscriptions } = await billing.check({
      plans: ALL_PAID_PLAN_IDS,
      isTest: process.env.NODE_ENV !== "production",
    });
    for (const subscription of appSubscriptions) {
      await billing.cancel({
        subscriptionId: subscription.id,
        isTest: process.env.NODE_ENV !== "production",
      });
    }
    await db.shopSettings.upsert({
      where: { shop: session.shop },
      create: { shop: session.shop, plan: "free" },
      update: { plan: "free" },
    });
    return { downgraded: true };
  }

  if (typeof planId !== "string" || !ALL_PAID_PLAN_IDS.includes(planId)) {
    throw new Response("Unknown plan", { status: 400 });
  }

  // `billing.request` redirects the merchant to Shopify's confirmation
  // page; on approval Shopify redirects back to `returnUrl`. Omitting it
  // lets the SDK default to the embedded admin.shopify.com URL for this
  // app (with the shop/host params App Bridge needs) — a custom bare
  // app URL here isn't embedded and crashes App Bridge on the way back.
  return billing.request({
    plan: planId,
    isTest: process.env.NODE_ENV !== "production",
  });
};

export default function Billing() {
  const { currentTier, interval } = useLoaderData<typeof loader>();

  const skuLabel = (limit: number | null) =>
    limit === null ? "SKUs illimités" : `jusqu'à ${limit.toLocaleString("fr-FR")} SKUs`;

  const frequencyLabel = (frequency: "none" | "weekly" | "daily") =>
    frequency === "none"
      ? "Pas de monitoring récurrent"
      : frequency === "weekly"
        ? "Ré-audit hebdomadaire + alertes"
        : "Ré-audit quotidien + alertes";

  return (
    <s-page heading="Abonnement">
      <s-section heading="Choisissez votre palier">
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-text>Facturation :</s-text>
          <s-link href="/app/billing?interval=monthly">
            {interval === "monthly" ? <strong>Mensuelle</strong> : "Mensuelle"}
          </s-link>
          <s-text>·</s-text>
          <s-link href="/app/billing?interval=annual">
            {interval === "annual" ? <strong>Annuelle</strong> : "Annuelle"}
          </s-link>
          <s-badge tone="success">
            -{Math.round(ANNUAL_DISCOUNT_RATE * 100)}% en annuel
          </s-badge>
        </s-stack>

        <s-stack direction="block" gap="base">
          {PLAN_CATALOG.map((plan) => {
            const isCurrent = currentTier === plan.tier;
            const price = interval === "annual" ? plan.priceAnnual : plan.priceMonthly;
            const priceLabel =
              plan.tier === "free"
                ? "0 $"
                : interval === "annual"
                  ? `${price} $/an`
                  : `${price} $/mois`;
            const planId =
              plan.tier === "free"
                ? "Free"
                : interval === "annual"
                  ? plan.annualPlanId
                  : plan.monthlyPlanId;

            return (
              <s-box
                key={plan.tier}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background={isCurrent ? "subdued" : undefined}
              >
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-stack direction="block" gap="small">
                    <s-heading>
                      {plan.name} — {priceLabel}
                    </s-heading>
                    <s-paragraph>
                      {skuLabel(plan.skuLimit)} · {frequencyLabel(plan.reAuditFrequency)}
                      {plan.csvExport && " · Export CSV"}
                      {plan.multiShop && " · Multi-boutiques"}
                    </s-paragraph>
                    {plan.tier !== "free" && !isCurrent && (
                      <s-paragraph>
                        Essai gratuit de {TRIAL_DAYS} jours, sans engagement.
                      </s-paragraph>
                    )}
                  </s-stack>
                  {isCurrent ? (
                    <s-badge tone="success">Plan actuel</s-badge>
                  ) : (
                    // reloadDocument forces a real, full-page form submission
                    // instead of a client-side fetch: billing.request()'s
                    // redirect target is Shopify's admin.shopify.com, a
                    // different origin than this embedded app, and only a
                    // genuine browser navigation can escape the iframe to
                    // follow it (a fetch-based submit just receives inert
                    // response data instead).
                    <Form method="post" reloadDocument>
                      <input type="hidden" name="plan" value={planId ?? "Free"} />
                      <s-button type="submit">Choisir</s-button>
                    </Form>
                  )}
                </s-stack>
              </s-box>
            );
          })}
        </s-stack>
      </s-section>
    </s-page>
  );
}
