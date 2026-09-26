import type { ProductForAudit } from "./audit-engine.server";

// Minimal shape of the `admin` GraphQL client returned by
// `authenticate.admin(request)` — avoids a hard dependency on the SDK's
// internal client type here.
interface AdminGraphqlClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

const PRODUCTS_QUERY = `#graphql
  query AuditProducts($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
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
    }
  }
`;

interface ProductsQueryResponse {
  data?: {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      edges: Array<{
        node: {
          id: string;
          title: string;
          descriptionHtml: string | null;
          vendor: string | null;
          productType: string | null;
          status: string;
          onlineStoreUrl: string | null;
          featuredImage: { url: string } | null;
          priceRangeV2: {
            minVariantPrice: { amount: string; currencyCode: string } | null;
          } | null;
          totalInventory: number | null;
          variants: {
            edges: Array<{
              node: {
                id: string;
                barcode: string | null;
                selectedOptions: { name: string; value: string }[];
              };
            }>;
          };
        };
      }>;
    };
  };
  errors?: unknown[];
}

// Shopify's Admin API rate-limits on query cost, not call count. Fetching
// 50 products (with 25 variants each) per page keeps individual requests
// well under the bucket size; on THROTTLED errors we back off and retry
// rather than fan out concurrent requests.
export async function fetchAllProductsForAudit(
  admin: AdminGraphqlClient,
  { maxProducts = 500 }: { maxProducts?: number } = {},
): Promise<ProductForAudit[]> {
  const products: ProductForAudit[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage && products.length < maxProducts) {
    const response = await requestWithBackoff(admin, cursor);
    const json = (await response.json()) as ProductsQueryResponse;

    const page = json.data?.products;
    if (!page) break;

    for (const { node } of page.edges) {
      products.push({
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
      });
    }

    hasNextPage = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }

  return products;
}

async function requestWithBackoff(
  admin: AdminGraphqlClient,
  cursor: string | null,
  attempt = 0,
): Promise<Response> {
  const response = await admin.graphql(PRODUCTS_QUERY, { variables: { cursor } });
  const json = (await response.clone().json()) as ProductsQueryResponse;

  const throttled = json.errors?.some(
    (e) => (e as { extensions?: { code?: string } })?.extensions?.code === "THROTTLED",
  );

  if (throttled && attempt < 5) {
    const delayMs = 500 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return requestWithBackoff(admin, cursor, attempt + 1);
  }

  return response;
}
