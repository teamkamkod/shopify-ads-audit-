import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify-auth.server";
import { unauthenticated } from "../shopify.server";
import { isRecurringMonitoringTier, type PlanTier } from "../billing-plans";
import { auditProduct, type ProductForAudit } from "../services/audit-engine.server";
import { sendBlockingIssuesAlert } from "../services/mailer.server";
import db from "../db.server";

const PRODUCT_QUERY = `#graphql
  query AuditSingleProduct($id: ID!) {
    product(id: $id) {
      id
      title
      descriptionHtml
      vendor
      productType
      status
      onlineStoreUrl
      featuredImage {
        url
      }
      priceRangeV2 {
        minVariantPrice {
          amount
          currencyCode
        }
      }
      totalInventory
      variants(first: 25) {
        edges {
          node {
            id
            barcode
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
`;

// Alerting on a broken product is a paid-tier feature (Free is a one-time
// audit only, never recurring monitoring — see billing-plans.ts). Free-tier
// shops still receive this webhook — Shopify has no per-shop static topic
// filtering — so we check the plan and no-op.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const shopSettings = await db.shopSettings.findUnique({ where: { shop } });
  if (!isRecurringMonitoringTier((shopSettings?.plan as PlanTier) ?? "free")) {
    return new Response();
  }

  const productId = (payload as { admin_graphql_api_id?: string }).admin_graphql_api_id;
  if (!productId) {
    return new Response();
  }

  const { admin } = await unauthenticated.admin(shop);
  const response = await admin.graphql(PRODUCT_QUERY, { variables: { id: productId } });
  const json = (await response.json()) as {
    data?: { product: null | Omit<ProductForAudit, "featuredImageUrl" | "priceRangeMin" | "currencyCode" | "variants"> & {
      featuredImage: { url: string } | null;
      priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } | null } | null;
      variants: { edges: Array<{ node: { id: string; barcode: string | null; selectedOptions: { name: string; value: string }[] } }> };
    } };
  };

  const node = json.data?.product;
  if (!node) {
    return new Response();
  }

  const product: ProductForAudit = {
    id: node.id,
    title: node.title,
    descriptionHtml: node.descriptionHtml,
    vendor: node.vendor,
    productType: node.productType,
    status: node.status,
    onlineStoreUrl: node.onlineStoreUrl,
    featuredImageUrl: node.featuredImage?.url ?? null,
    priceRangeMin: node.priceRangeV2?.minVariantPrice?.amount ?? null,
    currencyCode: node.priceRangeV2?.minVariantPrice?.currencyCode ?? null,
    totalInventory: node.totalInventory,
    variants: node.variants.edges.map((v) => ({
      id: v.node.id,
      barcode: v.node.barcode,
      selectedOptions: v.node.selectedOptions,
    })),
  };

  const result = auditProduct(product);
  const blockingIssues = result.issues.filter((i) => i.severity === "blocking");

  if (blockingIssues.length > 0) {
    // Recorded as a single-product audit run so it shows up in the
    // dashboard's history alongside full catalog audits.
    await db.auditRun.create({
      data: {
        shop,
        scoredProducts: 1,
        score: 0,
        blockingIssueCount: blockingIssues.length,
        recommendedIssueCount: result.issues.length - blockingIssues.length,
        adsIssueCount: 0,
        triggeredBy: "webhook",
        issues: {
          create: result.issues.map((issue) => ({
            productId: result.productId,
            productTitle: result.title,
            fieldId: issue.fieldId,
            openaiField: issue.openaiField,
            severity: issue.severity,
            message: issue.message,
          })),
        },
      },
    });

    await sendBlockingIssuesAlert(admin, shop, {
      scoredProducts: 1,
      blockingIssues: blockingIssues.map((issue) => ({
        productTitle: result.title,
        message: issue.message,
      })),
    });
  }

  return new Response();
};
