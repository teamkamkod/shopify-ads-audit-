import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

// This route used to render the scaffold's manual shop-domain form, which
// fails the App Store requirement that installation always starts from a
// Shopify surface. The path is kept alive (instead of deleted) so a link or
// bookmark never lands on a 404 — but it never asks for a domain.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // A `shop` parameter means Shopify handed the merchant over for
  // install/auth: forward into the embedded app, which does the OAuth
  // handshake with Shopify and triggers the install prompt.
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  throw redirect("/");
};

export const action = async () => {
  throw redirect("/");
};
