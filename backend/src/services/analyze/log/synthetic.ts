/**
 * Synthetic log generator, for tests.
 *
 * Lets a test state "this log has a MAF that under-reads by 5% at 3000 Hz" and
 * then assert the engine recovers exactly that, which is the only way to check
 * the correction math without a real car.
 */

export type SyntheticOptions = {
  /** Seconds of data. */
  durationSec?: number;
  sampleRateHz?: number;
  /** Steady cruise plateaus: [maf_hz, rpm, tps, seconds]. */
  plateaus?: Array<{ hz: number; rpm: number; tps: number; seconds: number }>;
  /** Fractional MAF error by frequency; +0.05 means MAF reads 5% low. */
  mafErrorAt?: (hz: number) => number;
  commandedAfr?: number;
  /** Extra columns appended verbatim, for channel-mapping tests. */
  extraColumns?: Record<string, (i: number, t: number) => number>;
  /** Overrides per sample index, for injecting faults. */
  overrides?: (i: number, t: number) => Partial<Record<string, number>> | undefined;
  header?: string[];
  preamble?: string[];
  noise?: number;
};

/** Deterministic PRNG so tests never flake. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function makeSyntheticLog(opts: SyntheticOptions = {}): string {
  const rate = opts.sampleRateHz ?? 10;
  const cmd = opts.commandedAfr ?? 14.7;
  const noise = opts.noise ?? 0;
  const rand = rng(12345);

  const plateaus =
    opts.plateaus ??
    [
      { hz: 2000, rpm: 1600, tps: 12, seconds: 20 },
      { hz: 3000, rpm: 2000, tps: 15, seconds: 20 },
      { hz: 4000, rpm: 2400, tps: 18, seconds: 20 }
    ];

  const errAt = opts.mafErrorAt ?? (() => 0);

  const cols = [
    "Time",
    "RPM",
    "TPS",
    "MAF Freq",
    "WBAFR",
    "AFR Cmd",
    "STFT B1",
    "STFT B2",
    "KR",
    "ECT",
    "IAT",
    ...Object.keys(opts.extraColumns ?? {})
  ];
  const header = opts.header ?? cols;

  const lines: string[] = [];
  for (const p of opts.preamble ?? []) lines.push(p);
  lines.push(header.join(","));

  let t = 0;
  let i = 0;
  for (const p of plateaus) {
    const n = Math.round(p.seconds * rate);
    for (let k = 0; k < n; k++, i++, t += 1 / rate) {
      const jitter = noise > 0 ? (rand() - 0.5) * 2 * noise : 0;
      // MAF under-reads by err, so the ECU under-fuels, so measured AFR is
      // lean by the same proportion. This is the relationship the engine
      // inverts to recover the correction.
      const err = errAt(p.hz);
      const wb = cmd * (1 + err) + jitter;

      const row: Record<string, number> = {
        Time: Number(t.toFixed(3)),
        RPM: p.rpm,
        TPS: p.tps,
        "MAF Freq": p.hz,
        WBAFR: Number(wb.toFixed(3)),
        "AFR Cmd": cmd,
        "STFT B1": 0,
        "STFT B2": 0,
        KR: 0,
        ECT: 90,
        IAT: 30
      };
      for (const [name, fn] of Object.entries(opts.extraColumns ?? {})) row[name] = fn(i, t);

      const ov = opts.overrides?.(i, t);
      if (ov) Object.assign(row, ov);

      lines.push(header.map((h) => (row[h] ?? "")).join(","));
    }
  }

  return lines.join("\n");
}
