import { Resend } from "resend";

interface AdminGraphqlClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

export interface BlockingIssueForAlert {
  productTitle: string;
  message: string;
}

const SHOP_EMAIL_QUERY = `#graphql
  query ShopEmail {
    shop {
      email
      contactEmail
    }
  }
`;

const MAX_ISSUES_LISTED = 20;

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

// Alerting is a paid-tier feature (Starter/Growth/Scale) — callers only
// invoke this for cron re-audits and the products/update webhook, both of
// which are already gated to recurring-monitoring plans upstream. A
// missing RESEND_API_KEY degrades to a console warning rather than a
// thrown error: the audit itself must still succeed even if alerting
// isn't configured yet (e.g. before Hermes provisions it in production).
export async function sendBlockingIssuesAlert(
  admin: AdminGraphqlClient,
  shop: string,
  { scoredProducts, blockingIssues }: { scoredProducts: number; blockingIssues: BlockingIssueForAlert[] },
): Promise<void> {
  if (blockingIssues.length === 0) return;

  const resend = getResendClient();
  if (!resend) {
    console.warn(`RESEND_API_KEY not configured — skipping alert email for ${shop}`);
    return;
  }

  const response = await admin.graphql(SHOP_EMAIL_QUERY);
  const json = (await response.json()) as {
    data?: { shop?: { email: string | null; contactEmail: string | null } };
  };
  const to = json.data?.shop?.contactEmail || json.data?.shop?.email;
  if (!to) {
    console.warn(`No contact email available for ${shop} — skipping alert email`);
    return;
  }

  const dashboardUrl = process.env.SHOPIFY_APP_URL
    ? `${process.env.SHOPIFY_APP_URL}/app`
    : null;

  const listedIssues = blockingIssues.slice(0, MAX_ISSUES_LISTED);
  const remaining = blockingIssues.length - listedIssues.length;

  const html = `
    <p>Le ré-audit automatique de votre catalogue (${scoredProducts} produit${scoredProducts > 1 ? "s" : ""} analysé${scoredProducts > 1 ? "s" : ""}) a détecté ${blockingIssues.length} problème${blockingIssues.length > 1 ? "s" : ""} bloquant${blockingIssues.length > 1 ? "s" : ""} pour votre feed ChatGPT Ads / Shopping :</p>
    <ul>
      ${listedIssues
        .map(
          (issue) =>
            `<li><strong>${escapeHtml(issue.productTitle)}</strong> — ${escapeHtml(issue.message)}</li>`,
        )
        .join("\n      ")}
    </ul>
    ${remaining > 0 ? `<p>…et ${remaining} autre${remaining > 1 ? "s" : ""}.</p>` : ""}
    ${dashboardUrl ? `<p><a href="${dashboardUrl}">Voir le détail dans le dashboard</a></p>` : ""}
  `.trim();

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "ChatGPT Ads Audit <alerts@kamkod.com>",
      to,
      subject: `${blockingIssues.length} problème${blockingIssues.length > 1 ? "s" : ""} bloquant${blockingIssues.length > 1 ? "s" : ""} détecté${blockingIssues.length > 1 ? "s" : ""} sur ${shop}`,
      html,
    });
  } catch (error) {
    // A failed email must never fail the audit that triggered it.
    console.error(`Failed to send alert email for ${shop}:`, error);
  }
}
