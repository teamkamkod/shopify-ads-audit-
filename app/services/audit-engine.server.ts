import { loadSpecRules, type SpecField, type Severity } from "./spec-rules.server";

export interface VariantForAudit {
  id: string;
  barcode: string | null;
  selectedOptions: { name: string; value: string }[];
}

export interface ProductForAudit {
  id: string;
  title: string;
  descriptionHtml: string | null;
  vendor: string | null;
  productType: string | null;
  status: string;
  onlineStoreUrl: string | null;
  featuredImageUrl: string | null;
  priceRangeMin: string | null;
  currencyCode: string | null;
  totalInventory: number | null;
  variants: VariantForAudit[];
}

export interface AuditIssueResult {
  fieldId: string;
  openaiField: string;
  label: string;
  severity: Severity;
  message: string;
}

export interface ProductAuditResult {
  productId: string;
  title: string;
  issues: AuditIssueResult[];
}

const HTML_TAG_RE = /<\/?[a-z][\s\S]*>/i;

function hasResidualHtml(value: string | null): boolean {
  if (!value) return false;
  return HTML_TAG_RE.test(value);
}

function isAllCaps(value: string): boolean {
  const letters = value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  return letters.length > 3 && letters === letters.toUpperCase();
}

function normalizeCategoryOptions(names: string[]): string[] {
  return names.map((n) => n.trim().toLowerCase());
}

function checkField(field: SpecField, product: ProductForAudit): boolean {
  switch (field.rule) {
    case "maxLength":
      return product.title.length <= (field.maxLength ?? Infinity);

    case "notAllCaps":
      return !isAllCaps(product.title);

    case "noResidualHtml":
      return !hasResidualHtml(product.descriptionHtml);

    case "required": {
      if (field.openaiField === "description") {
        return Boolean(product.descriptionHtml && product.descriptionHtml.trim().length > 0);
      }
      if (field.openaiField === "availability") {
        return Boolean(product.status);
      }
      if (field.openaiField === "brand") {
        return Boolean(product.vendor && product.vendor.trim().length > 0);
      }
      return true;
    }

    case "requiredResolvedUrl":
      return Boolean(product.featuredImageUrl && product.featuredImageUrl.startsWith("http"));

    case "requiredPriceWithCurrency":
      return Boolean(product.priceRangeMin && product.currencyCode);

    case "requiredPublicUrl":
      return Boolean(product.onlineStoreUrl);

    case "gtinFormat": {
      const min = field.minDigits ?? 8;
      const max = field.maxDigits ?? 14;
      return product.variants.some((v) => {
        if (!v.barcode) return false;
        const digits = v.barcode.trim();
        return new RegExp(`^\\d{${min},${max}}$`).test(digits);
      });
    }

    case "requiredMappedCategory":
      return Boolean(product.productType && product.productType.trim().length > 0);

    case "alwaysMissingNative":
      // Shopify has no native `condition` field; this is a systemic gap
      // until a shop configures a `condition` metafield (out of scope here).
      return false;

    case "requiredVariantOptions": {
      const expected = normalizeCategoryOptions(field.expectedOptions ?? []);
      const optionNames = normalizeCategoryOptions(
        product.variants.flatMap((v) => v.selectedOptions.map((o) => o.name)),
      );
      return optionNames.some((name) => expected.includes(name));
    }

    default:
      return true;
  }
}

export function auditProduct(product: ProductForAudit): ProductAuditResult {
  const spec = loadSpecRules();
  const issues: AuditIssueResult[] = [];

  for (const field of spec.fields) {
    const passed = checkField(field, product);
    if (!passed) {
      issues.push({
        fieldId: field.id,
        openaiField: field.openaiField,
        label: field.label,
        severity: field.severity,
        message: field.message,
      });
    }
  }

  return { productId: product.id, title: product.title, issues };
}

export interface StoreAuditSummary {
  scoredProducts: number;
  score: number;
  blockingIssueCount: number;
  recommendedIssueCount: number;
  adsIssueCount: number;
  results: ProductAuditResult[];
}

export function summarizeAudit(results: ProductAuditResult[]): StoreAuditSummary {
  const scoredProducts = results.length;
  let blockingIssueCount = 0;
  let recommendedIssueCount = 0;
  let adsIssueCount = 0;
  let cleanProducts = 0;

  for (const result of results) {
    const blocking = result.issues.filter((i) => i.severity === "blocking").length;
    const recommended = result.issues.filter((i) => i.severity === "recommended").length;
    const ads = result.issues.filter((i) => i.severity === "ads").length;

    blockingIssueCount += blocking;
    recommendedIssueCount += recommended;
    adsIssueCount += ads;

    if (blocking === 0 && recommended === 0) cleanProducts += 1;
  }

  const score = scoredProducts === 0 ? 100 : Math.round((cleanProducts / scoredProducts) * 100);

  return {
    scoredProducts,
    score,
    blockingIssueCount,
    recommendedIssueCount,
    adsIssueCount,
    results,
  };
}
