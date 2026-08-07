import { SERVICE_PRICES, ADDON_PRICES } from "./stripe_catalog.js";

/**
 * Does the catalogue in this repo still agree with the live Stripe account?
 *
 * Two records of the same fact now exist — the table in stripe_catalog.ts and
 * the `dd84_service` / `dd84_addon` metadata on each Stripe price — and at
 * runtime **metadata wins**. That is deliberate (it lets a product be added
 * without a deploy) and it is exactly why drift is dangerous: a mistyped tag
 * in the Stripe dashboard silently changes what a payment creates.
 *
 * The worst case is a swap. An add-on tagged `dd84_service` starts creating a
 * job every time someone buys a rush fee; a service tagged `dd84_addon` stops
 * creating them at all, and the customer pays and waits forever.
 *
 * Neither the code nor Stripe can notice that alone. Pure and tested here so
 * the comparison is verified even though the HTTP call around it cannot be.
 */

export type LivePrice = {
  id: string;
  active?: boolean;
  metadata?: Record<string, string>;
};

export type DriftFinding = {
  priceId: string;
  label: string;
  /** SWAPPED is the dangerous one: the tag says the opposite of what we sell. */
  kind: "SWAPPED" | "MISMATCH" | "UNTAGGED" | "ARCHIVED" | "MISSING";
  message: string;
};

export type DriftReport = {
  taggedAndAgreeing: number;
  total: number;
  findings: DriftFinding[];
  /** True when every finding is merely "not tagged yet" — safe, the table covers it. */
  onlyUntagged: boolean;
};

type Expectation = { key: "dd84_service" | "dd84_addon"; value: string; label: string };

export function expectedCatalog(): Map<string, Expectation> {
  const expected = new Map<string, Expectation>();
  for (const [id, e] of Object.entries(SERVICE_PRICES)) {
    expected.set(id, { key: "dd84_service", value: e.service, label: e.label });
  }
  for (const [id, e] of Object.entries(ADDON_PRICES)) {
    expected.set(id, { key: "dd84_addon", value: e.addon, label: e.label });
  }
  return expected;
}

export function compareCatalog(live: LivePrice[]): DriftReport {
  const expected = expectedCatalog();
  const byId = new Map(live.map((p) => [p.id, p]));
  const findings: DriftFinding[] = [];
  let taggedAndAgreeing = 0;

  for (const [priceId, want] of expected) {
    const price = byId.get(priceId);
    if (!price) {
      findings.push({
        priceId,
        label: want.label,
        kind: "MISSING",
        message: `${want.label}: price ${priceId} was not found in Stripe`
      });
      continue;
    }

    // An archived price cannot be checked out against, so the app is selling
    // something Stripe will refuse — a dead button on the buy page.
    if (price.active === false) {
      findings.push({
        priceId,
        label: want.label,
        kind: "ARCHIVED",
        message: `${want.label}: archived in Stripe but still sold by the app`
      });
    }

    const meta = price.metadata ?? {};
    const otherKey = want.key === "dd84_service" ? "dd84_addon" : "dd84_service";

    if (meta[otherKey]) {
      findings.push({
        priceId,
        label: want.label,
        kind: "SWAPPED",
        message:
          `${want.label}: Stripe tags it ${otherKey}=${meta[otherKey]}, but the app sells it as a ` +
          `${want.key === "dd84_service" ? "service" : "add-on"}. Stripe wins at runtime.`
      });
      continue;
    }

    if (!meta[want.key]) {
      findings.push({
        priceId,
        label: want.label,
        kind: "UNTAGGED",
        message: `${want.label}: no ${want.key} metadata in Stripe (the built-in table still covers it)`
      });
      continue;
    }

    if (meta[want.key] !== want.value) {
      findings.push({
        priceId,
        label: want.label,
        kind: "MISMATCH",
        message: `${want.label}: Stripe says ${want.key}=${meta[want.key]}, the app expects ${want.value}. Stripe wins at runtime.`
      });
      continue;
    }

    taggedAndAgreeing++;
  }

  return {
    taggedAndAgreeing,
    total: expected.size,
    findings,
    // Untagged is the one benign state: the static table still classifies it
    // correctly. Everything else changes behaviour and needs fixing.
    onlyUntagged: findings.length > 0 && findings.every((f) => f.kind === "UNTAGGED")
  };
}
