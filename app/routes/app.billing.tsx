import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify-auth.server";
import {
  ALL_PAID_PLAN_IDS,
  ANNUAL_DISCOUNT_RATE,
  PLAN_CATALOG,
  TRIAL_DAYS,
  planDefinition,
  tierOf,
  type BillingIntervalChoice,
} from "../billing-plans";
import {
  createLinkInvite,
  listLinkedShops,
  redeemLinkInvite,
  resolveEffectiveTier,
  unlinkShop,
} from "../services/shop-links.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);

  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: ALL_PAID_PLAN_IDS,
    isTest: process.env.NODE_ENV !== "production",
  });

  const ownTier = hasActivePayment ? tierOf(appSubscriptions[0]?.name) : "free";
  // Folds in an inherited Scale tier for a shop linked to another shop's
  // subscription — its own billing.check legitimately reports no payment.
  const currentTier = await resolveEffectiveTier(session.shop, ownTier);

  // Persisted so the products/update webhook and the cron re-audit job can
  // check the plan without calling the Billing API on every request.
  await db.shopSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, plan: currentTier },
    update: { plan: currentTier },
  });

  const shopSettings = await db.shopSettings.findUnique({ where: { shop: session.shop } });
  const linkedTo = shopSettings?.primaryShopDomain ?? null;
  // Only a shop paying for Scale itself — not one that merely inherited it
  // via a link — can invite further shops, to avoid invite chains.
  const canManageLinkedShops = ownTier === "scale";
  const linkedShops = canManageLinkedShops ? await listLinkedShops(session.shop) : [];

  const url = new URL(request.url);
  const interval: BillingIntervalChoice =
    url.searchParams.get("interval") === "annual" ? "annual" : "monthly";

  return {
    currentTier,
    interval,
    linkedTo,
    canManageLinkedShops,
    linkedShops,
    maxLinkedShops: planDefinition("scale").maxLinkedShops,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create-invite") {
    try {
      const inviteCode = await createLinkInvite(session.shop);
      return { inviteCode };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unknown error." };
    }
  }

  if (intent === "redeem-invite") {
    const code = formData.get("code");
    if (typeof code !== "string" || !code.trim()) {
      return { error: "Please enter a code." };
    }
    try {
      const primaryShop = await redeemLinkInvite(code, session.shop);
      return { linked: primaryShop };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unknown error." };
    }
  }

  if (intent === "unlink") {
    await unlinkShop(session.shop);
    return { unlinked: true };
  }

  // Plan selection (default). Choosing a plan — including Free — sets up
  // or clears this shop's own billing relationship, so any inherited link
  // to another shop's Scale subscription no longer applies.
  await db.shopSettings.updateMany({
    where: { shop: session.shop, primaryShopDomain: { not: null } },
    data: { primaryShopDomain: null },
  });

  const planId = formData.get("plan");

  if (planId === "Free") {
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
  const { currentTier, interval, linkedTo, canManageLinkedShops, linkedShops, maxLinkedShops } =
    useLoaderData<typeof loader>();
  const inviteFetcher = useFetcher<typeof action>();
  const redeemFetcher = useFetcher<typeof action>();
  const unlinkFetcher = useFetcher<typeof action>();

  const skuLabel = (limit: number | null) =>
    limit === null ? "Unlimited SKUs" : `Up to ${limit.toLocaleString("en-US")} SKUs`;

  const frequencyLabel = (frequency: "none" | "weekly" | "daily") =>
    frequency === "none"
      ? "No recurring monitoring"
      : frequency === "weekly"
        ? "Weekly re-audit + alerts"
        : "Daily re-audit + alerts";

  return (
    <s-page heading="Subscription">
      {linkedTo && (
        <s-banner tone="info" heading="Linked store">
          <s-paragraph>
            This store is on the Scale plan through the subscription of <strong>{linkedTo}</strong>,
            with no separate billing.
          </s-paragraph>
          <unlinkFetcher.Form method="post">
            <input type="hidden" name="intent" value="unlink" />
            <s-button type="submit" {...(unlinkFetcher.state !== "idle" ? { loading: true } : {})}>
              Unlink this store
            </s-button>
          </unlinkFetcher.Form>
        </s-banner>
      )}

      <s-section heading="Choose your plan">
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-text>Billing:</s-text>
          <s-link href="/app/billing?interval=monthly">
            {interval === "monthly" ? <strong>Monthly</strong> : "Monthly"}
          </s-link>
          <s-text>·</s-text>
          <s-link href="/app/billing?interval=annual">
            {interval === "annual" ? <strong>Annual</strong> : "Annual"}
          </s-link>
          <s-badge tone="success">
            -{Math.round(ANNUAL_DISCOUNT_RATE * 100)}% on annual
          </s-badge>
        </s-stack>

        <s-stack direction="block" gap="base">
          {PLAN_CATALOG.map((plan) => {
            const isCurrent = currentTier === plan.tier;
            const price = interval === "annual" ? plan.priceAnnual : plan.priceMonthly;
            const priceLabel =
              plan.tier === "free"
                ? "$0"
                : interval === "annual"
                  ? `$${price}/year`
                  : `$${price}/month`;
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
                      {plan.csvExport && " · CSV export"}
                      {plan.multiShop && ` · Multi-store (up to ${plan.maxLinkedShops} linked)`}
                    </s-paragraph>
                    {plan.tier !== "free" && !isCurrent && (
                      <s-paragraph>
                        Free {TRIAL_DAYS}-day trial, no commitment.
                      </s-paragraph>
                    )}
                  </s-stack>
                  {isCurrent ? (
                    <s-badge tone="success">Current plan</s-badge>
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
                      <s-button type="submit">Choose</s-button>
                    </Form>
                  )}
                </s-stack>
              </s-box>
            );
          })}
        </s-stack>
      </s-section>

      {canManageLinkedShops && (
        <s-section heading="Linked stores (Scale)">
          <s-paragraph>
            {linkedShops.length} / {maxLinkedShops} stores linked to this subscription.
          </s-paragraph>
          {linkedShops.length > 0 && (
            <s-stack direction="block" gap="small">
              {linkedShops.map((linked) => (
                <s-text key={linked.shop}>{linked.shop}</s-text>
              ))}
            </s-stack>
          )}
          <inviteFetcher.Form method="post">
            <input type="hidden" name="intent" value="create-invite" />
            <s-button
              type="submit"
              {...(inviteFetcher.state !== "idle" ? { loading: true } : {})}
            >
              Generate an invite code
            </s-button>
          </inviteFetcher.Form>
          {inviteFetcher.data && "inviteCode" in inviteFetcher.data && (
            <s-banner tone="success">
              <s-paragraph>
                Code: <strong>{inviteFetcher.data.inviteCode}</strong> (valid for 15 minutes) —
                enter it on the other store&apos;s Subscription page, in the{" "}
                &quot;Link this store to a Scale subscription&quot; section.
              </s-paragraph>
            </s-banner>
          )}
          {inviteFetcher.data && "error" in inviteFetcher.data && (
            <s-banner tone="critical">
              <s-paragraph>{inviteFetcher.data.error}</s-paragraph>
            </s-banner>
          )}
        </s-section>
      )}

      {!linkedTo && currentTier !== "scale" && (
        <s-section heading="Link this store to a Scale subscription">
          <s-paragraph>
            If another store already pays for Scale, enter the invite code it gave you to join the
            same subscription without separate billing.
          </s-paragraph>
          <redeemFetcher.Form method="post">
            <input type="hidden" name="intent" value="redeem-invite" />
            <s-text-field name="code" label="Invite code" placeholder="e.g. A1B2C3D4" />
            <s-button
              type="submit"
              {...(redeemFetcher.state !== "idle" ? { loading: true } : {})}
            >
              Link this store
            </s-button>
          </redeemFetcher.Form>
          {redeemFetcher.data && "linked" in redeemFetcher.data && (
            <s-banner tone="success">
              <s-paragraph>Store linked successfully.</s-paragraph>
            </s-banner>
          )}
          {redeemFetcher.data && "error" in redeemFetcher.data && (
            <s-banner tone="critical">
              <s-paragraph>{redeemFetcher.data.error}</s-paragraph>
            </s-banner>
          )}
        </s-section>
      )}
    </s-page>
  );
}
