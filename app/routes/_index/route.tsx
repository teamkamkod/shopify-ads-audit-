import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import styles from "./styles.module.css";

export const meta = () => [
  { title: "ChatGPT Ads Audit for Shopify" },
  {
    name: "description",
    content:
      "Audit your Shopify product data against the OpenAI Commerce feed spec, and get alerted when a product change breaks compliance.",
  },
];

// There is deliberately no shop-domain input here. Shopify requires
// installation to start from a Shopify surface (App Store listing, Partner
// link) and forbids asking a merchant to type `.myshopify.com` by hand.
// A request that already carries `shop` is a hand-off from Shopify, so it is
// forwarded to the embedded app, which runs the OAuth handshake.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function App() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Is your catalog ready for ChatGPT Ads?</h1>
        <p className={styles.text}>
          Audit your Shopify product data against the OpenAI Commerce feed spec in one click — and
          get alerted whenever a product change breaks compliance.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Blocking checks.</strong> Title, description, image, price, availability and
            the public product link — the fields a product is rejected over.
          </li>
          <li>
            <strong>Recommended and ads checks.</strong> GTIN/barcode, brand, product category,
            condition, and variant structure for is_ads_eligible.
          </li>
          <li>
            <strong>Recurring monitoring.</strong> Weekly or daily re-audits with an email alert
            when a new blocking issue appears, and CSV export on Growth and Scale.
          </li>
        </ul>
        <p className={styles.note}>
          Free for catalogs up to 50 SKUs. Paid plans from $9/month, with a 7-day free trial.
        </p>
        <p className={styles.note}>
          Install from the Shopify App Store. This app audits how ready your product data is for the
          OpenAI Commerce spec; it does not report your actual indexing status in ChatGPT or your
          enrollment in the OpenAI Merchant Program — neither is accessible outside OpenAI.
        </p>
      </div>
    </div>
  );
}
