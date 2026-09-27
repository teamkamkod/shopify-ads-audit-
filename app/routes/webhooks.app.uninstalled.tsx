import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify-auth.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already
  // been uninstalled, so this is deliberately unconditional: `deleteMany` is
  // idempotent, and the session row must not survive this handler. Leaving it
  // behind is what makes the *next* webhook from that shop fail: the stored
  // offline token cannot be refreshed any more (the app is gone), and the SDK
  // turns that refresh failure into a bare 500 before the handler ever runs.
  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
