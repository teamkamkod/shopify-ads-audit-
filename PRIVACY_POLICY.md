# Privacy Policy — ChatGPT Ads Audit

Ready-to-publish content for the public privacy policy page Shopify
requires for the App Store listing (see `APP_STORE_LISTING.md`).

**Before publishing, fill in the bracketed placeholders** — I don't have
your company's legal name, registered address, or jurisdiction, so I left
those as placeholders rather than guess:
- `[Legal entity name]` — the registered business name behind Kamkod
- `[Registered address]`
- `[Effective date]` — the date you publish this page

Everything else below is accurate to what the app's code actually does —
cross-checked against `app/shopify.server.ts` (scopes), the webhook
handlers, `app/services/mailer.server.ts`, and the README's GDPR section,
not written from a generic template.

---

## Privacy Policy for ChatGPT Ads Audit

**Effective date:** [Effective date]

This policy describes how **ChatGPT Ads Audit** ("the app"), provided by
**[Legal entity name]** ("Kamkod", "we", "us"), handles data when a
merchant installs it on a Shopify store.

### 1. What we access

The app requests the `read_products` scope from Shopify. This gives us
read access to your store's **product catalog only**:

- Product title, description, vendor, product type, status
- Featured image URL
- Price and currency
- Inventory count
- Variant data, including barcode/GTIN and option values
- Whether the product has a public storefront URL

We use this data solely to check it against OpenAI's Commerce spec (the
data requirements for ChatGPT Shopping/Ads) and show you the result.

We also request `write_products`, required by a Shopify CLI validation
quirk tied to the `products/update` webhook topic — **the app never
creates, edits, or deletes any product data.**

### 2. What we do not access

We do not request, read, or store:

- Customer personal data (names, addresses, emails, order history)
- Order or checkout data
- Payment or financial information
- Any data outside the `read_products` scope

The only place a contact email appears is described in section 4 below.

### 3. Data we store

To provide the dashboard, automatic re-audits, and billing features, we
store the following in our database (hosted on Supabase, EU region —
Paris, France):

- Your shop's `.myshopify.com` domain
- Your current subscription plan
- Audit history: for each audit run, a compliance score and a list of
  issues found (each issue includes the affected product's title and ID,
  and a description of the problem — e.g. "missing GTIN")
- If you use the Scale plan's multi-store feature, the domains of stores
  linked under your subscription

We do not store your storefront's actual product content (descriptions,
images) — only the pass/fail result of each compliance check.

### 4. Email alerts (paid plans only)

On paid plans with automatic re-auditing (Starter, Growth, Scale), if a
re-audit finds a new compliance-blocking issue, we send an alert email to
your store's contact address. We retrieve this address live from
Shopify's Admin API (`shop.contactEmail` / `shop.email`) at the moment we
send the email — **we do not store your contact email in our database.**

These emails are delivered via **Resend** (resend.com), a third-party
email delivery service based in the United States. Resend processes the
recipient address and email content solely to deliver that message on our
behalf.

### 5. Why we process this data

We process the data above to provide the service you installed the app
for: auditing your product catalog, tracking compliance over time, and
billing your chosen subscription plan through Shopify's Billing API. This
is necessary to perform the contract formed when you install the app.

### 6. Data retention and deletion

- Audit history is retained for as long as the app is installed on your
  store.
- When you **uninstall the app**, Shopify sends us a `shop/redact`
  webhook; on receipt, we delete your shop's stored settings and all
  associated audit history and issues from our database.
- If a customer of yours submits a data request or erasure request
  through Shopify (the mandatory `customers/data_request` and
  `customers/redact` webhooks), we respond confirming that we hold no
  customer personal data — because, as described in section 2, we never
  access or store any.

### 7. Third-party processors

| Processor | Purpose | Location |
|---|---|---|
| Shopify | App platform, billing, product data access | Global |
| Supabase | Database hosting | Paris, France (EU) |
| Resend | Alert email delivery | United States |

We do not sell or share your data with any other third party, and we do
not use your data for advertising or profiling.

### 8. Your rights

Depending on your jurisdiction, you may have the right to access,
correct, export, or request deletion of the data we hold about your
store. Since audit history is tied to your shop and deleted automatically
on uninstall, uninstalling the app removes this data. For any other
request, contact us using the details below.

### 9. Cookies and tracking

The app runs embedded inside your Shopify admin via Shopify's App Bridge.
We do not set our own tracking cookies or use third-party analytics or
advertising pixels.

### 10. Changes to this policy

We may update this policy as the app's features change. Material changes
will be reflected here with an updated effective date.

### 11. Contact

Questions about this policy or your data: **[support email — e.g.
team@kamkod.com or a dedicated support@kamkod.com]**, or by mail at
**[Registered address]**.
