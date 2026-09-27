import crypto from "node:crypto";
import db from "../db.server";
import { planDefinition, type PlanTier } from "../billing-plans";

const INVITE_TTL_MS = 15 * 60 * 1000;

// A shop's billed tier stays whatever its own Shopify subscription says
// (`ownTier`, from billing.check); this folds in an inherited Scale tier
// when the shop is linked to another shop's Scale subscription instead of
// paying for its own. Callers persist the *result* into `ShopSettings.plan`
// so cron/webhook handlers — which trust that cached field directly — need
// no special-casing for linked shops.
export async function resolveEffectiveTier(shop: string, ownTier: PlanTier): Promise<PlanTier> {
  if (ownTier !== "free") return ownTier;

  const settings = await db.shopSettings.findUnique({ where: { shop } });
  if (!settings?.primaryShopDomain) return "free";

  const primary = await db.shopSettings.findUnique({ where: { shop: settings.primaryShopDomain } });
  return primary?.plan === "scale" ? "scale" : "free";
}

export async function createLinkInvite(primaryShop: string): Promise<string> {
  const primary = await db.shopSettings.findUnique({ where: { shop: primaryShop } });
  if (primary?.plan !== "scale") {
    throw new Error("Only a store paying for the Scale plan itself can invite other stores.");
  }

  const cap = planDefinition("scale").maxLinkedShops;
  const linkedCount = await db.shopSettings.count({ where: { primaryShopDomain: primaryShop } });
  if (linkedCount >= cap) {
    throw new Error(`Limit of ${cap} linked stores reached for this subscription.`);
  }

  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  await db.shopLinkInvite.create({
    data: { code, primaryShop, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });
  return code;
}

export async function redeemLinkInvite(rawCode: string, requestingShop: string): Promise<string> {
  const code = rawCode.trim().toUpperCase();
  const invite = await db.shopLinkInvite.findUnique({ where: { code } });

  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    throw new Error("Invalid or expired code.");
  }
  if (invite.primaryShop === requestingShop) {
    throw new Error("A store cannot link to itself.");
  }

  const primary = await db.shopSettings.findUnique({ where: { shop: invite.primaryShop } });
  if (primary?.plan !== "scale") {
    throw new Error("The inviting store is no longer on the Scale plan.");
  }

  const cap = planDefinition("scale").maxLinkedShops;
  const linkedCount = await db.shopSettings.count({ where: { primaryShopDomain: invite.primaryShop } });
  if (linkedCount >= cap) {
    throw new Error("Linked stores limit reached for this subscription.");
  }

  await db.$transaction([
    db.shopSettings.upsert({
      where: { shop: requestingShop },
      create: { shop: requestingShop, plan: "scale", primaryShopDomain: invite.primaryShop },
      update: { plan: "scale", primaryShopDomain: invite.primaryShop },
    }),
    db.shopLinkInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), usedByShop: requestingShop },
    }),
  ]);

  return invite.primaryShop;
}

export async function unlinkShop(shop: string): Promise<void> {
  await db.shopSettings.update({
    where: { shop },
    data: { plan: "free", primaryShopDomain: null },
  });
}

export async function listLinkedShops(primaryShop: string) {
  return db.shopSettings.findMany({
    where: { primaryShopDomain: primaryShop },
    select: { shop: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}
