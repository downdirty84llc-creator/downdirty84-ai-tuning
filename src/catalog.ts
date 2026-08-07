import { apiGet, apiPost } from "./client";

export type CatalogService = {
  service: "LOG_REVIEW" | "PRIORITY_LOG_REVIEW" | "STAGE1_NA" | "STAGE1_BOOST";
  label: string;
  priceId: string;
  /** null when Stripe could not be reached. Never render null as free. */
  unitAmount: number | null;
  currency: string;
};

export type CatalogAddon = {
  addon: "RUSH" | "EXTRA_REVISION" | "REVISION_PACK" | "TRAVEL";
  label: string;
  priceId: string;
  unitAmount: number | null;
  currency: string;
};

export type Catalog = {
  /** False when amounts could not be confirmed with Stripe. */
  pricesLive: boolean;
  services: CatalogService[];
  addons: CatalogAddon[];
};

export function getCatalog() {
  return apiGet<Catalog>("/api/v1/catalog");
}

export function startCheckout(input: {
  service: string;
  addons?: string[];
  email?: string;
  vehicle?: string;
  platform?: string;
  fuel?: string;
  induction?: string;
}) {
  return apiPost<{ checkoutUrl: string; sessionId: string }>("/api/v1/checkout", input);
}

/**
 * Money, formatted from the smallest currency unit.
 *
 * Returns null rather than "$0.00" when the amount is unknown, so a caller
 * cannot accidentally advertise something as free.
 */
export function formatMoney(unitAmount: number | null, currency: string): string | null {
  if (unitAmount === null || !Number.isFinite(unitAmount)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: unitAmount % 100 === 0 ? 0 : 2
  }).format(unitAmount / 100);
}
