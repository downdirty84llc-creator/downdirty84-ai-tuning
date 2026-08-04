import type { BrandProfile } from "../brand/brand_profile.js";

export function renderSummaryText(diffSet: any, ctx: { brand: BrandProfile }): string {
  const lines: string[] = [];

  lines.push(`${ctx.brand.brandName} — Log Review & Change List`);
  lines.push(`Website: ${ctx.brand.website}`);
  lines.push(`Support: ${ctx.brand.supportEmail}`);
  lines.push(ctx.brand.disclaimer.short);
  lines.push("");

  lines.push(`Change List Summary • DiffSet: ${diffSet.name}`);
  lines.push("");
  lines.push("MAF Correction Summary");
  lines.push("- Apply APPROVED items first. Keep curve smooth (avoid > ~3% adjacent jumps).");
  lines.push("");

  const items = (diffSet.items ?? []).slice().sort((a: any, b: any) => (a.coordinates?.x ?? 0) - (b.coordinates?.x ?? 0));
  for (const it of items) {
    const hz = it.coordinates?.x;
    const mult = it.after;
    const conf = typeof it.confidence === "number" ? it.confidence.toFixed(2) : "";
    lines.push(`- ${hz} Hz: ${mult}× • conf ${conf} • ${it.status}`);
  }

  lines.push("");
  lines.push(ctx.brand.disclaimer.full);

  return lines.join("\n");
}
