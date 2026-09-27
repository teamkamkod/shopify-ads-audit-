import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify-auth.server";

// Mandatory GDPR compliance webhook: a customer or store owner requesting
// the customer data this app holds. This app does not store any
// customer-level data (only shop-level product audit results), so there
// is nothing to return beyond acknowledging the request.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`, payload);

  return new Response();
};
