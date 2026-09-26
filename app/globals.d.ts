declare module "*.css";

// Ensures the Polaris web component JSX augmentations (s-app-nav, etc.)
// from @shopify/app-bridge-types are always loaded, even on routes that
// don't import anything from @shopify/app-bridge-react directly.
import "@shopify/app-bridge-types";
