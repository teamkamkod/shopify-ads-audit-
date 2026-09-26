import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ALL_PAID_PLAN_IDS, planDefinition, tierOf } from "../billing-plans";
import db from "../db.server";

// Escapes a value for a CSV cell: wraps in quotes and doubles any embedded
// quote, per RFC 4180. Needed because product titles/messages routinely
// contain commas.
function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);

  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: ALL_PAID_PLAN_IDS,
    isTest: process.env.NODE_ENV !== "production",
  });
  const tier = hasActivePayment ? tierOf(appSubscriptions[0]?.name) : "free";

  if (!planDefinition(tier).csvExport) {
    throw new Response("L'export CSV nécessite le palier Growth ou Scale.", { status: 403 });
  }

  const lastRun = await db.auditRun.findFirst({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    include: { issues: true },
  });

  if (!lastRun) {
    throw new Response("Aucun audit à exporter.", { status: 404 });
  }

  const header = ["Produit", "Champ OpenAI", "Sévérité", "Message"];
  const rows = lastRun.issues.map((issue) => [
    issue.productTitle,
    issue.openaiField,
    issue.severity,
    issue.message,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-${session.shop}-${lastRun.createdAt.toISOString().slice(0, 10)}.csv"`,
    },
  });
};
