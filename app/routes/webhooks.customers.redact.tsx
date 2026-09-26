import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Mandatory GDPR compliance webhook: erase any customer data this app
// holds, 10 days after a redaction request. This app does not store any
// customer-level data (only shop-level product audit results), so there
// is nothing to erase beyond acknowledging the request.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`, payload);

  return new Response();
};
