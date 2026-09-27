import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const meta = () => [
  { title: "ChatGPT Ads Audit for Shopify" },
  {
    name: "description",
    content:
      "Audit your Shopify product data against the OpenAI Commerce feed spec, and get alerted when a product change breaks compliance.",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Is your catalog ready for ChatGPT Ads?</h1>
        <p className={styles.text}>
          Audit your Shopify product data against the OpenAI Commerce feed spec in one click — and
          get alerted whenever a product change breaks compliance.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
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
          This app audits how ready your product data is for the OpenAI Commerce spec. It does not
          report your actual indexing status in ChatGPT or your enrollment in the OpenAI Merchant
          Program — neither is accessible outside OpenAI.
        </p>
      </div>
    </div>
  );
}
