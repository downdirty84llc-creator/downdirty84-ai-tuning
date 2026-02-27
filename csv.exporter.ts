type ExportOpts = {
  includeSuggested: boolean;
  minConfidence: number;
};

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"\${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportCsv(diffSet: any, opts: ExportOpts): string {
  const header = [
    "diffSetId","itemId","type","path","x","y","before","after","units","confidence","reason","applyNotes","status"
  ];

  const typeRank = (t: string) => (t === "SCALAR" ? 0 : t === "TABLE_CELL" ? 1 : 2);

  const rows = (diffSet.items ?? [])
    .filter((it: any) => {
      const conf = typeof it.confidence === "number" ? it.confidence : 0;
      if (conf < opts.minConfidence) return false;
      if (it.status === "REJECTED") return false;
      if (!opts.includeSuggested && it.status === "SUGGESTED") return false;
      return true;
    })
    .sort((a: any, b: any) => {
      const pa = a.path || "", pb = b.path || "";
      if (pa !== pb) return pa.localeCompare(pb);
      const ta = typeRank(a.type), tb = typeRank(b.type);
      if (ta !== tb) return ta - tb;
      const ax = a.coordinates?.x ?? 1e18, bx = b.coordinates?.x ?? 1e18;
      if (ax !== bx) return ax - bx;
      const ay = a.coordinates?.y ?? 1e18, by = b.coordinates?.y ?? 1e18;
      if (ay !== by) return ay - by;
      return (a.itemId ?? 0) - (b.itemId ?? 0);
    })
    .map((it: any) => [
      diffSet.diffSetId,
      it.itemId,
      it.type,
      it.path,
      it.coordinates?.x ?? "",
      it.coordinates?.y ?? "",
      it.before ?? "",
      it.after ?? "",
      it.units ?? "",
      it.confidence ?? "",
      it.reason ?? "",
      it.applyNotes ?? "",
      it.status ?? ""
    ]);

  const out: string[] = [];
  out.push(header.join(","));
  for (const r of rows) out.push(r.map(csvEscape).join(","));
  return out.join("\n");
}
