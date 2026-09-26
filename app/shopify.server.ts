import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import type { BillingConfigSubscriptionLineItemPlan } from "@shopify/shopify-api";
import prisma from "./db.server";
import { PLAN_CATALOG, TRIAL_DAYS } from "./billing-plans";

// One Shopify billing config entry per (tier x interval): the Billing API
// has no native monthly/annual toggle for a single plan, so each interval
// is its own named plan (see billing-plans.ts). Annual prices are already
// discounted, not modeled via the API's `discount` field (that's for
// temporary promos over N cycles, not a standing annual rate).
const billingConfig: Record<string, BillingConfigSubscriptionLineItemPlan> =
  Object.fromEntries(
    PLAN_CATALOG.filter((plan) => plan.tier !== "free").flatMap((plan) => [
      [
        plan.monthlyPlanId!,
        {
          trialDays: TRIAL_DAYS,
          lineItems: [
            {
              amount: plan.priceMonthly,
              currencyCode: "USD",
              interval: BillingInterval.Every30Days,
            },
          ],
        },
      ],
      [
        plan.annualPlanId!,
        {
          trialDays: TRIAL_DAYS,
          lineItems: [
            {
              amount: plan.priceAnnual,
              currencyCode: "USD",
              interval: BillingInterval.Annual,
            },
          ],
        },
      ],
    ]),
  );

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: billingConfig,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
