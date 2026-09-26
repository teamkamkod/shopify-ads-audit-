import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { BILLING_PLANS } from "../billing-plans";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);

  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: Object.values(BILLING_PLANS),
    isTest: process.env.NODE_ENV !== "production",
  });

  const currentPlan = hasActivePayment ? appSubscriptions[0]?.name : "Free";

  // Persisted so the products/update webhook handler can check the plan
  // without calling the Billing API on every product change.
  await db.shopSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, plan: currentPlan.toLowerCase() },
    update: { plan: currentPlan.toLowerCase() },
  });

  return { shop: session.shop, currentPlan };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan");

  if (plan === "Free") {
    // Downgrading: cancel any active paid subscription.
    const { appSubscriptions } = await billing.check({
      plans: Object.values(BILLING_PLANS),
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

  if (plan !== BILLING_PLANS.PRO && plan !== BILLING_PLANS.AGENCE) {
    throw new Response("Unknown plan", { status: 400 });
  }

  // `billing.request` redirects the merchant to Shopify's confirmation
  // page; on approval Shopify redirects back to `returnUrl`.
  return billing.request({
    plan,
    isTest: process.env.NODE_ENV !== "production",
    returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing`,
  });
};

export default function Billing() {
  const { currentPlan } = useLoaderData<typeof loader>();

  const plans = [
    {
      id: "Free",
      name: "Free",
      price: "0 $/mois",
      description: "Audit ponctuel à l'installation, score global + 3-5 problèmes bloquants.",
    },
    {
      id: BILLING_PLANS.PRO,
      name: "Pro",
      price: "19 $/mois",
      description:
        "Rapport complet, ré-audit hebdomadaire, alerte dès qu'un produit ajouté casse la conformité.",
    },
    {
      id: BILLING_PLANS.AGENCE,
      name: "Agence",
      price: "49 $/mois",
      description: "Multi-boutiques sous un seul compte, export CSV des actions correctives.",
    },
  ];

  return (
    <s-page heading="Abonnement">
      <s-section heading="Choisissez votre palier">
        <s-stack direction="block" gap="base">
          {plans.map((plan) => (
            <s-box
              key={plan.id}
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background={currentPlan === plan.id ? "subdued" : undefined}
            >
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-stack direction="block" gap="small">
                  <s-heading>
                    {plan.name} — {plan.price}
                  </s-heading>
                  <s-paragraph>{plan.description}</s-paragraph>
                </s-stack>
                {currentPlan === plan.id ? (
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
                    <input type="hidden" name="plan" value={plan.id} />
                    <s-button type="submit">Choisir</s-button>
                  </Form>
                )}
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}
