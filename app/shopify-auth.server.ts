import crypto from "node:crypto";
import { authenticate as shopifyAuthenticate } from "./shopify.server";

/**
 * Wrappers around the Shopify SDK authentication helpers.
 *
 * The SDK (shopify-app-react-router 1.2.1 / shopify-api 13.1.0) turns three
 * error paths into uncaught `Response(500)`s — the exact behaviour Shopify's
 * App Store review harness flags. Two are malformed-input cases, one is a
 * normal lifecycle case:
 *
 *  1. `authenticate.admin()`: `sanitizeHost()` base64-decodes the `host` query
 *     parameter and passes the result straight to `new URL()`. Shopify's
 *     security suite deliberately sends a non-base64 `host` (e.g.
 *     `9998322874899999999`); the decoded bytes are not a valid URL and the
 *     TypeError escapes as a 500 instead of a clean 4xx.
 *  2. `authenticate.webhook()`: the raw body is `JSON.parse`d without a guard,
 *     so a valid-HMAC request carrying a non-JSON body throws a SyntaxError
 *     and also ends up as a 500.
 *  3. `authenticate.webhook()` again, but this time for a *correctly formed*
 *     request: `ensureValidOfflineSession()` refreshes the offline token when
 *     the stored session is expired (`future.expiringOfflineAccessTokens` is
 *     on), and `refresh-token.mjs` converts every refresh failure other than
 *     `InvalidJwtError` / `invalid_subject_token` into a bare
 *     `throw new Response(undefined, { status: 500 })`. A shop that
 *     uninstalled the app therefore makes *every* webhook it still owes us
 *     (app/uninstalled, shop/redact, Shopify's retries) answer 500, with no
 *     log line at all — reproducible on demand with an expired session whose
 *     refresh token is dead.
 *
 * All three are handled here, before the SDK sees them, so a malformed request
 * gets a 400 / 401 and a webhook from a shop whose token can no longer be
 * refreshed still gets processed instead of failing.
 */

function isInvalidUrlError(error: unknown): boolean {
  return error instanceof TypeError && (error as { code?: string }).code === "ERR_INVALID_URL";
}

export async function authenticateAdmin(
  request: Request,
): Promise<Awaited<ReturnType<typeof shopifyAuthenticate.admin>>> {
  try {
    return await shopifyAuthenticate.admin(request);
  } catch (error) {
    if (isInvalidUrlError(error)) {
      throw new Response("Invalid shop or host parameter", { status: 400 });
    }
    throw error;
  }
}

/** Reads (and parses) a copy of the body, leaving the original stream intact. */
async function assertJsonBody(request: Request): Promise<void> {
  const raw = await request.clone().text();
  if (!raw.trim()) return; // the SDK already answers a clean 400 for an empty body
  try {
    JSON.parse(raw);
  } catch {
    throw new Response("Invalid webhook payload", { status: 400 });
  }
}

type WebhookContext = Awaited<ReturnType<typeof shopifyAuthenticate.webhook>>;

/** Same HMAC check the SDK performs, so the degraded path is not a bypass. */
function hasValidHmac(rawBody: string, header: string | null): boolean {
  const secret = process.env.SHOPIFY_API_SECRET ?? "";
  if (!header || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Webhook context built without a session, used when the stored offline token
 * can no longer be refreshed (uninstalled shop, revoked token).
 *
 * The request is still authenticated: the HMAC above is the same signature the
 * SDK verifies, and an invalid one answers 401 exactly like the SDK does. Only
 * `session` / `admin` are missing — the same shape the SDK itself returns for a
 * shop it holds no session for, so handlers that only need `shop` / `topic` /
 * `payload` (the GDPR ones) keep working instead of crashing on a 500.
 */
function degradedWebhookContext(request: Request, rawBody: string): WebhookContext {
  if (!hasValidHmac(rawBody, request.headers.get("x-shopify-hmac-sha256"))) {
    throw new Response(undefined, { status: 401, statusText: "Unauthorized" });
  }
  const header = (name: string) => request.headers.get(name) ?? undefined;
  let payload: unknown = {};
  try {
    payload = rawBody.trim() ? JSON.parse(rawBody) : {};
  } catch {
    throw new Response("Invalid webhook payload", { status: 400 });
  }
  return {
    apiVersion: header("x-shopify-api-version") ?? "",
    shop: header("x-shopify-shop-domain") ?? "",
    topic: header("x-shopify-topic") ?? "",
    webhookId: header("x-shopify-webhook-id") ?? "",
    payload,
    session: undefined,
    admin: undefined,
    webhookType: "Webhooks",
    subTopic: header("x-shopify-sub-topic"),
    name: header("x-shopify-webhook-name"),
    triggeredAt: header("x-shopify-triggered-at"),
    eventId: header("x-shopify-event-id"),
  } as unknown as WebhookContext;
}

export async function authenticateWebhook(
  request: Request,
): Promise<Awaited<ReturnType<typeof shopifyAuthenticate.webhook>>> {
  await assertJsonBody(request);
  const rawBody = await request.clone().text();
  try {
    return await shopifyAuthenticate.webhook(request);
  } catch (error) {
    if (error instanceof Response && error.status >= 500) {
      // NODE_ENV=production silences the SDK logger, so this is the only trace
      // we get of a failed offline-token refresh. Log it, then degrade.
      console.error(
        "[webhook] SDK returned %d for %s %s - offline token refresh failed, processing without a session",
        error.status,
        request.headers.get("x-shopify-topic"),
        request.headers.get("x-shopify-shop-domain"),
      );
      return degradedWebhookContext(request, rawBody);
    }
    throw error;
  }
}

/**
 * Drop-in replacement for the SDK's `authenticate` object: routes only change
 * the import path, every `authenticate.admin(...)` / `authenticate.webhook(...)`
 * call site keeps working — but now hardened against the three 500s above.
 */
export const authenticate = {
  admin: authenticateAdmin,
  webhook: authenticateWebhook,
};
