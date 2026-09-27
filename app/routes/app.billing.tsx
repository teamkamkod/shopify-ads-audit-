import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
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
      return { error: error instanceof Error ? error.message : "Erreur inconnue." };
    }
  }

  if (intent === "redeem-invite") {
    const code = formData.get("code");
    if (typeof code !== "string" || !code.trim()) {
      return { error: "Merci de saisir un code." };
    }
    try {
      const primaryShop = await redeemLinkInvite(code, session.shop);
      return { linked: primaryShop };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Erreur inconnue." };
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
    limit === null ? "SKUs illimités" : `jusqu'à ${limit.toLocaleString("fr-FR")} SKUs`;

  const frequencyLabel = (frequency: "none" | "weekly" | "daily") =>
    frequency === "none"
      ? "Pas de monitoring récurrent"
      : frequency === "weekly"
        ? "Ré-audit hebdomadaire + alertes"
        : "Ré-audit quotidien + alertes";

  return (
    <s-page heading="Abonnement">
      {linkedTo && (
        <s-banner tone="info" heading="Boutique liée">
          <s-paragraph>
            Cette boutique bénéficie du palier Scale via l&apos;abonnement de{" "}
            <strong>{linkedTo}</strong>, sans facturation séparée.
          </s-paragraph>
          <unlinkFetcher.Form method="post">
            <input type="hidden" name="intent" value="unlink" />
            <s-button type="submit" {...(unlinkFetcher.state !== "idle" ? { loading: true } : {})}>
              Délier cette boutique
            </s-button>
          </unlinkFetcher.Form>
        </s-banner>
      )}

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
                      {plan.multiShop && ` · Multi-boutiques (jusqu'à ${plan.maxLinkedShops} liées)`}
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

      {canManageLinkedShops && (
        <s-section heading="Boutiques liées (Scale)">
          <s-paragraph>
            {linkedShops.length} / {maxLinkedShops} boutiques liées à cet abonnement.
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
              Générer un code d&apos;invitation
            </s-button>
          </inviteFetcher.Form>
          {inviteFetcher.data && "inviteCode" in inviteFetcher.data && (
            <s-banner tone="success">
              <s-paragraph>
                Code : <strong>{inviteFetcher.data.inviteCode}</strong> (valable 15 minutes) — à
                saisir dans la page Abonnement de l&apos;autre boutique, section « Lier cette
                boutique à un abonnement Scale ».
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
        <s-section heading="Lier cette boutique à un abonnement Scale">
          <s-paragraph>
            Si une autre boutique paie déjà le palier Scale, entrez ici le code d&apos;invitation
            qu&apos;elle vous a communiqué pour rejoindre le même abonnement sans facturation
            séparée.
          </s-paragraph>
          <redeemFetcher.Form method="post">
            <input type="hidden" name="intent" value="redeem-invite" />
            <s-text-field name="code" label="Code d'invitation" placeholder="ex. A1B2C3D4" />
            <s-button
              type="submit"
              {...(redeemFetcher.state !== "idle" ? { loading: true } : {})}
            >
              Lier cette boutique
            </s-button>
          </redeemFetcher.Form>
          {redeemFetcher.data && "linked" in redeemFetcher.data && (
            <s-banner tone="success">
              <s-paragraph>Boutique liée avec succès.</s-paragraph>
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
