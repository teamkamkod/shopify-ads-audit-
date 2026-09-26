// Shared between the client and server: shopify.server.ts is server-only
// and can't be imported from a route's client bundle, so this small
// constant lives in its own module.
export const BILLING_PLANS = {
  PRO: "Pro",
  AGENCE: "Agence",
} as const;
