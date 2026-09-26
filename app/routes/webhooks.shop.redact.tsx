import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory GDPR compliance webhook, sent 48 hours after a shop uninstalls
// the app. Erase everything this app stored for that shop: sessions and
// audit history. `onDelete: Cascade` on AuditRun/AuditIssue means deleting
// ShopSettings removes them too.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`, payload);

  await db.session.deleteMany({ where: { shop } });
  await db.shopSettings.deleteMany({ where: { shop } });

  return new Response();
};
