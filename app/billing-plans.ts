// Shared between the client and server: shopify.server.ts is server-only
// and can't be imported from a route's client bundle, so the pricing
// catalog lives in its own module.
//
// Shopify's Billing API has no native "monthly vs annual" toggle for a
// single plan — each billing interval is its own named plan. So each
// paid tier gets two plan ids (monthly/annual); `tierOf` maps either
// back to the tier slug for feature-gating (SKU caps, alerting, etc.).
export const BILLING_PLANS = {
  STARTER_MONTHLY: "Starter",
  STARTER_ANNUAL: "Starter (annuel)",
  GROWTH_MONTHLY: "Growth",
  GROWTH_ANNUAL: "Growth (annuel)",
  SCALE_MONTHLY: "Scale",
  SCALE_ANNUAL: "Scale (annuel)",
} as const;

export type PlanTier = "free" | "starter" | "growth" | "scale";
export type BillingIntervalChoice = "monthly" | "annual";

export const TRIAL_DAYS = 7;
// Annual price already reflects a 20% discount vs 12x the monthly price
// (e.g. Starter: 9 * 12 = 108 → 108 * 0.8 = 86.4, rounded to 86).
export const ANNUAL_DISCOUNT_RATE = 0.2;

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  skuLimit: number | null; // null = unlimited
  reAuditFrequency: "none" | "weekly" | "daily";
  csvExport: boolean;
  multiShop: boolean;
  priceMonthly: number; // 0 for Free
  priceAnnual: number; // 0 for Free
  monthlyPlanId: string | null; // Shopify billing config key, null for Free
  annualPlanId: string | null;
}

export const PLAN_CATALOG: PlanDefinition[] = [
  {
    tier: "free",
    name: "Free",
    skuLimit: 50,
    reAuditFrequency: "none",
    csvExport: false,
    multiShop: false,
    priceMonthly: 0,
    priceAnnual: 0,
    monthlyPlanId: null,
    annualPlanId: null,
  },
  {
    tier: "starter",
    name: "Starter",
    skuLimit: 1000,
    reAuditFrequency: "weekly",
    csvExport: false,
    multiShop: false,
    priceMonthly: 9,
    priceAnnual: 86,
    monthlyPlanId: BILLING_PLANS.STARTER_MONTHLY,
    annualPlanId: BILLING_PLANS.STARTER_ANNUAL,
  },
  {
    tier: "growth",
    name: "Growth",
    skuLimit: 5000,
    reAuditFrequency: "daily",
    csvExport: true,
    multiShop: false,
    priceMonthly: 19,
    priceAnnual: 182,
    monthlyPlanId: BILLING_PLANS.GROWTH_MONTHLY,
    annualPlanId: BILLING_PLANS.GROWTH_ANNUAL,
  },
  {
    tier: "scale",
    name: "Scale",
    skuLimit: null,
    reAuditFrequency: "daily",
    csvExport: true,
    multiShop: true,
    priceMonthly: 39,
    priceAnnual: 374,
    monthlyPlanId: BILLING_PLANS.SCALE_MONTHLY,
    annualPlanId: BILLING_PLANS.SCALE_ANNUAL,
  },
];

const PLAN_NAME_TO_TIER: Record<string, PlanTier> = Object.fromEntries(
  PLAN_CATALOG.flatMap((plan) => [
    ...(plan.monthlyPlanId ? [[plan.monthlyPlanId, plan.tier]] : []),
    ...(plan.annualPlanId ? [[plan.annualPlanId, plan.tier]] : []),
  ]),
) as Record<string, PlanTier>;

export function tierOf(shopifyPlanName: string | null | undefined): PlanTier {
  if (!shopifyPlanName) return "free";
  return PLAN_NAME_TO_TIER[shopifyPlanName] ?? "free";
}

export function planDefinition(tier: PlanTier): PlanDefinition {
  const plan = PLAN_CATALOG.find((p) => p.tier === tier);
  if (!plan) throw new Error(`Unknown plan tier: ${tier}`);
  return plan;
}

export function isRecurringMonitoringTier(tier: PlanTier): boolean {
  return tier !== "free";
}

export const ALL_PAID_PLAN_IDS = PLAN_CATALOG.flatMap((plan) => [
  plan.monthlyPlanId,
  plan.annualPlanId,
]).filter((id): id is string => id !== null);
