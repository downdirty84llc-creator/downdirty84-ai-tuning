import {
  resolveChannel,
  isPlausible,
  detectLambda,
  STOICH_GASOLINE,
  type Channel
} from "./channels.js";

export type Toolchain = "HPT" | "HOLLEY" | "UNKNOWN";

export type ParsedLog = {
  toolchain: Toolchain;
  /** Canonical channel -> value per sample. Same length as `sampleCount`. */
  series: Partial<Record<Channel, number[]>>;
  sampleCount: number;
  /** Seconds per sample, derived from the time channel. */
  sampleRateHz: number | null;
  durationSec: number;
  /** Vendor columns we could not map. Surfaced, never silently dropped. */
  unmappedColumns: string[];
  /** Conversions applied, so a report can state its own assumptions. */
  notes: string[];
};

export class LogParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LogParseError";
  }
}

/** Split a CSV line, honouring quoted fields containing commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function countNumeric(cells: string[]): number {
  return cells.filter((c) => c !== "" && Number.isFinite(Number(c))).length;
}

/**
 * Find the header row.
 *
 * Vendor exports open with a variable preamble (title, vehicle info, blank
 * lines) and some put a units row directly beneath the header. The header is
 * the last mostly-non-numeric row before sustained numeric data begins, which
 * is more robust than assuming a fixed line number.
 */
function findHeader(rows: string[][]): { headerIdx: number; firstDataIdx: number } {
  for (let i = 0; i < rows.length - 1; i++) {
    const cells = rows[i];
    if (cells.length < 2) continue;
    const headerLooksTextual = countNumeric(cells) <= cells.length * 0.3;
    if (!headerLooksTextual) continue;

    // Scan forward past an optional units row to the first numeric row.
    for (let j = i + 1; j < Math.min(i + 4, rows.length); j++) {
      const next = rows[j];
      if (next.length !== cells.length) continue;
      if (countNumeric(next) >= Math.max(2, next.length * 0.5)) {
        return { headerIdx: i, firstDataIdx: j };
      }
    }
  }
  throw new LogParseError("Could not locate a header row followed by numeric data.");
}

function detectToolchain(text: string): Toolchain {
  const head = text.slice(0, 2000).toLowerCase();
  if (head.includes("hp tuners") || head.includes("vcm scanner") || head.includes("hptuners")) {
    return "HPT";
  }
  if (head.includes("holley") || head.includes("terminator") || head.includes("dominator")) {
    return "HOLLEY";
  }
  return "UNKNOWN";
}

/**
 * Parse a vendor datalog CSV into canonical channels.
 *
 * Deliberately strict about what it will not do: an unrecognised column is
 * listed in `unmappedColumns` rather than guessed at, and an implausible value
 * becomes NaN rather than being clamped into range — a clamped sensor dropout
 * reads as real data to every rule downstream.
 */
export function parseLog(content: string | Buffer): ParsedLog {
  const text = typeof content === "string" ? content : content.toString("utf8");
  if (text.trim() === "") throw new LogParseError("Log file is empty.");

  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new LogParseError("Log file has no data rows.");

  const rows = lines.map(splitCsvLine);
  const { headerIdx, firstDataIdx } = findHeader(rows);
  const header = rows[headerIdx];

  const notes: string[] = [];
  const unmappedColumns: string[] = [];

  // Map columns to channels. On a duplicate, the first column wins and the
  // later one is reported — silently overwriting would hide a real ambiguity.
  const colToChannel = new Map<number, Channel>();
  const claimed = new Set<Channel>();
  header.forEach((name, idx) => {
    if (name === "") return;
    const ch = resolveChannel(name);
    if (!ch) { unmappedColumns.push(name); return; }
    if (claimed.has(ch)) {
      unmappedColumns.push(`${name} (duplicate of ${ch})`);
      return;
    }
    claimed.add(ch);
    colToChannel.set(idx, ch);
  });

  const series: Partial<Record<Channel, number[]>> = {};
  for (const ch of colToChannel.values()) series[ch] = [];

  for (let r = firstDataIdx; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length !== header.length) continue; // trailing junk / summary rows
    if (countNumeric(cells) === 0) continue;

    for (const [idx, ch] of colToChannel) {
      const raw = cells[idx];
      const num = raw === "" ? NaN : Number(raw);
      // Raw here; plausibility is applied below, after any unit conversion.
      // Filtering first would discard lambda values (~1.0) as implausible AFR
      // and leave nothing to detect the unit from.
      series[ch]!.push(num);
    }
  }

  const sampleCount = series.t?.length ?? Object.values(series)[0]?.length ?? 0;
  if (sampleCount === 0) throw new LogParseError("No usable data rows found.");

  // Lambda logged on an AFR channel -> convert, and say so. Must happen before
  // the plausibility pass, since lambda values sit well below the AFR range.
  for (const ch of ["afr_wb", "afr_cmd"] as const) {
    const vals = series[ch];
    if (vals && detectLambda(vals)) {
      series[ch] = vals.map((v) => (Number.isFinite(v) ? v * STOICH_GASOLINE : v));
      notes.push(
        `${ch} appeared to be lambda; converted to AFR using gasoline stoich (${STOICH_GASOLINE}). ` +
          `If this log is E85 or diesel, that conversion is wrong.`
      );
    }
  }

  // Now enforce plausibility. Implausible -> NaN, never clamped: a clamped
  // sensor dropout reads as real data to every rule downstream.
  for (const ch of Object.keys(series) as Channel[]) {
    const vals = series[ch];
    if (!vals) continue;
    series[ch] = vals.map((v) => (Number.isFinite(v) && isPlausible(ch, v) ? v : NaN));
  }

  // Time base. Absent or unusable -> synthesise nothing; report null and let
  // validation fail rather than inventing a sample rate.
  let sampleRateHz: number | null = null;
  let durationSec = 0;
  const t = series.t;
  if (t && t.length > 1) {
    const finite = t.filter((v) => Number.isFinite(v));
    if (finite.length > 1) {
      const first = finite[0];
      const last = finite[finite.length - 1];
      durationSec = Math.max(0, last - first);
      if (durationSec > 0) sampleRateHz = (finite.length - 1) / durationSec;
    }
  }

  return {
    toolchain: detectToolchain(text),
    series,
    sampleCount,
    sampleRateHz,
    durationSec,
    unmappedColumns,
    notes
  };
}
