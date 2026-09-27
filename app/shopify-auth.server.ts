import { authenticate as shopifyAuthenticate } from "./shopify.server";

/**
 * Wrappers around the Shopify SDK authentication helpers.
 *
 * The SDK (shopify-app-react-router 1.2.1 / shopify-api 13.1.0) turns two
 * malformed-input cases into uncaught exceptions, which surface as a 500
 * Internal Server Error — the exact behaviour Shopify's App Store review
 * harness flags:
 *
 *  1. `authenticate.admin()`: `sanitizeHost()` base64-decodes the `host`
 *     query parameter and passes the result straight to `new URL()`. Shopify's
 *     security suite deliberately sends a non-base64 `host` (e.g.
 *     `9998322874899999999`); the decoded bytes are not a valid URL and the
 *     TypeError escapes as a 500 instead of a clean 4xx.
 *  2. `authenticate.webhook()`: the raw body is `JSON.parse`d without a guard,
 *     so a valid-HMAC request carrying a non-JSON body throws a SyntaxError
 *     and also ends up as a 500.
 *
 * Both are handled here, before the SDK sees them, so a malformed request gets
 * a 400 and never a 500.
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

export async function authenticateWebhook(
  request: Request,
): Promise<Awaited<ReturnType<typeof shopifyAuthenticate.webhook>>> {
  await assertJsonBody(request);
  return shopifyAuthenticate.webhook(request);
}

/**
 * Drop-in replacement for the SDK's `authenticate` object: routes only change
 * the import path, every `authenticate.admin(...)` / `authenticate.webhook(...)`
 * call site keeps working — but now hardened against the two 500s above.
 */
export const authenticate = {
  admin: authenticateAdmin,
  webhook: authenticateWebhook,
};
