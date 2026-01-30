type DiffItem = {
  path: string;
  type: string;
  valueMode: string;
  units: string;
  coordinates?: { x?: number; y?: number | null };
};

type DiffSet = { items: DiffItem[] };

const EDITABLE_ALLOWLIST = new Set(["Airflow.MAF.Curve"]);

export function enforceMvpDiffAllowlist(diffSet: DiffSet) {
  for (const it of diffSet.items || []) {
    if (it.path.startsWith("Diag.")) {
      throw new Error(`MVP_ENFORCEMENT: Non-editable path not allowed: ${it.path}`);
    }
    if (!EDITABLE_ALLOWLIST.has(it.path)) {
      throw new Error(`MVP_ENFORCEMENT: Path not allowed in MVP: ${it.path}`);
    }
    if (it.type !== "CURVE_POINT") {
      throw new Error(`MVP_ENFORCEMENT: Invalid type for ${it.path}: ${it.type}`);
    }
    if (it.valueMode !== "MULTIPLIER") {
      throw new Error(`MVP_ENFORCEMENT: Invalid valueMode for ${it.path}: ${it.valueMode}`);
    }
    if (it.units !== "multiplier") {
      throw new Error(`MVP_ENFORCEMENT: Invalid units for ${it.path}: ${it.units}`);
    }
    if (!it.coordinates || typeof it.coordinates.x !== "number") {
      throw new Error(`MVP_ENFORCEMENT: Missing coordinates.x (Hz) for ${it.path}`);
    }
  }
}
