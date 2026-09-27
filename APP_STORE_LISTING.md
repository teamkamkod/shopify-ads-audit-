# Shopify App Store — listing copy (draft)

Ready-to-paste copy for the Partner Dashboard listing form. Character
limits below are Shopify's current guidance (tagline ~60-70, introduction
~100, feature bullets ~80) — double-check the actual input field limits in
the Partner Dashboard at submission time, since Shopify does tweak these.

Written in English, since that's the App Store's primary review/search
language — a French listing can be added afterwards as a second locale in
the Partner Dashboard if useful for French-speaking merchants.

**This file is copy only.** Four things listed at the bottom are required
by Shopify before you can actually submit and don't exist yet — a public
demo store or video, a published privacy policy URL, real screenshots, and
a confirmed support email/URL. None of those are code — flagging them here
so they don't get missed.

---

## App name

```
ChatGPT Ads Audit
```
(17 characters — under the 30-character limit; matches `shopify.app.toml`.)

## Tagline

```
Audit your catalog for ChatGPT Shopping readiness
```
(50 characters)

## Introduction

```
Check every product against OpenAI's Commerce spec before it blocks your ChatGPT Ads feed.
```
(92 characters)

## App details (long description)

```
ChatGPT Ads Audit scans your product catalog against OpenAI's Commerce
spec — the data requirements ChatGPT uses to show and sell products in
chat — and tells you exactly which products are blocked, and why, before
you find out the hard way.

Run a full-catalog audit in one click. Get a compliance score, a list of
blocking issues (missing price, broken image, no GTIN, residual HTML in
descriptions, and more), and recommended fixes for each product — ranked
by what OpenAI treats as required versus optional.

On paid plans, the app re-audits your catalog automatically and emails you
the moment a product breaks compliance — so a bad edit doesn't sit
unnoticed in your feed for a week.

Key features:
- Full-catalog audit against OpenAI's Commerce spec, one click
- Blocking vs. recommended issues, scored per product
- Checks title, description, image, price, GTIN, brand, category
- Weekly or daily automatic re-audits (Starter / Growth / Scale)
- Email alerts the moment a product breaks compliance
- CSV export of every issue found (Growth / Scale)
- Multi-store support under a single Scale subscription

What this app does not do: it does not verify your actual indexing status
inside ChatGPT, and it does not enroll your store in OpenAI's Merchant
Program — those aren't accessible from outside ChatGPT and remain
separate steps on OpenAI's side. This app covers the one part you can
control and verify yourself: whether your product data meets the spec.
```

## Pricing details (must match the Billing API config exactly)

```
Free — $0/month
Up to 50 SKUs. One-time audit only — no recurring re-audit or alerts.

Starter — $9/month or $86/year (save 20%)
Up to 1,000 SKUs. Weekly automatic re-audit + email alerts.
7-day free trial.

Growth — $19/month or $182/year (save 20%)
Up to 5,000 SKUs. Daily automatic re-audit + email alerts + CSV export.
7-day free trial.

Scale — $39/month or $374/year (save 20%)
Unlimited SKUs. Daily re-audit + alerts + CSV export + up to 5 linked
stores under one subscription.
7-day free trial.

All charges are billed through Shopify. Uninstalling cancels billing
immediately.
```

## Category / search terms

Suggested category: **Marketing** (or **Store management**, if Shopify's
current taxonomy splits "product data / SEO" tools separately — pick
whichever the Partner Dashboard's own category list matches best at
submission time).

Search terms: `chatgpt`, `chatgpt shopping`, `chatgpt ads`, `openai
commerce`, `ai shopping`, `product feed audit`, `product data compliance`,
`gtin`, `catalog audit`.

## FAQ (optional listing section, recommended given the disclaimer above)

**Does this app guarantee my products will appear in ChatGPT?**
No. It audits your product data against OpenAI's published Commerce spec
so your feed is technically eligible — actual indexing and ranking inside
ChatGPT are controlled entirely by OpenAI and aren't visible from outside
their system.

**Do I still need to enroll in OpenAI's Merchant Program?**
Yes, separately — this app doesn't handle enrollment. It only prepares
and monitors your product data.

**What store data does this app access?**
Only product data (title, description, images, price, inventory, variants)
via the `read_products` scope. It doesn't read customer or order data,
except to fulfill Shopify's mandatory GDPR webhooks (which only ever
delete data on request — see the app's privacy policy).

**Can I use one subscription across multiple stores?**
Yes, on the Scale plan — up to 5 stores can link to one Scale
subscription instead of paying separately. See the app's Billing page for
the invite-code flow.

---

## Not yet ready — required before you can submit

1. **Public privacy policy URL.** Shopify requires a live, publicly
   reachable privacy policy page for the listing. None exists yet for
   this app — needs a real page (e.g. `kamkod.com/apps/chatgpt-ads-audit/
   privacy`) covering what's in the README's GDPR section (data accessed,
   the 3 mandatory webhooks, no data sold/shared).
2. **Demo store or feature video.** Reviewers and merchants need either a
   demo store they can browse without installing, or a walkthrough video.
   `kamkod-audit-dev.myshopify.com` is a private dev store, not a public
   demo — needs its storefront made reviewable, or a short screen
   recording instead.
3. **Screenshots (1–6, per Shopify's current size spec).** Suggested
   shots: the dashboard with a completed audit + score, the blocking
   issues list, the Billing page (plan comparison), and the CSV export
   link. None captured yet — needs a store with real audit data to
   screenshot from.
4. **Support email and URL.** Placeholder not yet confirmed — likely
   `team@kamkod.com` plus a kamkod.com support/contact page, but confirm
   before submitting since this is what merchants use to reach you post-
   install.
