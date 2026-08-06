import type { Channel } from "./channels.js";
import type { ParsedLog } from "./parser.js";

/** A contiguous span of samples, expressed in both index and seconds. */
export type Window = {
  startIdx: number;
  endIdx: number; // inclusive
  startSec: number;
  endSec: number;
};

export function windowSeconds(w: Window): number {
  return Math.max(0, w.endSec - w.startSec);
}

/** Evidence ranges as the Findings contract expects them: [startSec, endSec]. */
export function toEvidenceRanges(windows: Window[]): Array<[number, number]> {
  return windows.map((w) => [round(w.startSec, 1), round(w.endSec, 1)]);
}

export function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

export function has(log: ParsedLog, ch: Channel): boolean {
  const s = log.series[ch];
  return Array.isArray(s) && s.some((v) => Number.isFinite(v));
}

export function at(log: ParsedLog, ch: Channel, i: number): number {
  return log.series[ch]?.[i] ?? NaN;
}

function timeAt(log: ParsedLog, i: number): number {
  const t = log.series.t?.[i];
  if (Number.isFinite(t)) return t as number;
  // No time channel: fall back to index, which keeps windows ordered even
  // though their seconds are meaningless. Validation fails such logs anyway.
  return i;
}

/**
 * Find every contiguous run of samples where `predicate` holds for at least
 * `minSeconds`.
 *
 * Sustained-condition detection is the core primitive for every safety rule:
 * a single lean sample is noise, three seconds of lean under load is a finding.
 * `maxGapSeconds` lets a brief dropout or one bad sample not split an otherwise
 * continuous event into two shorter ones that both fall under the minimum.
 */
export function findSustained(
  log: ParsedLog,
  predicate: (i: number) => boolean,
  opts: { minSeconds: number; maxGapSeconds?: number }
): Window[] {
  const maxGap = opts.maxGapSeconds ?? 0.5;
  const n = log.sampleCount;
  const out: Window[] = [];

  let start = -1;
  let lastTrue = -1;

  const flush = () => {
    if (start < 0 || lastTrue < 0) return;
    const w: Window = {
      startIdx: start,
      endIdx: lastTrue,
      startSec: timeAt(log, start),
      endSec: timeAt(log, lastTrue)
    };
    if (windowSeconds(w) >= opts.minSeconds) out.push(w);
    start = -1;
    lastTrue = -1;
  };

  for (let i = 0; i < n; i++) {
    if (predicate(i)) {
      if (start < 0) start = i;
      lastTrue = i;
    } else if (start >= 0 && timeAt(log, i) - timeAt(log, lastTrue) > maxGap) {
      flush();
    }
  }
  flush();
  return out;
}

/** Samples inside a window, dropping NaN. */
export function valuesIn(log: ParsedLog, ch: Channel, w: Window): number[] {
  const s = log.series[ch];
  if (!s) return [];
  const out: number[] = [];
  for (let i = w.startIdx; i <= w.endIdx && i < s.length; i++) {
    if (Number.isFinite(s[i])) out.push(s[i]);
  }
  return out;
}

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Median absolute deviation — a spread measure that a few wild samples cannot
 * inflate the way standard deviation can. Used both to filter outliers and to
 * score how trustworthy a MAF correction bin is.
 */
export function mad(values: number[]): number {
  if (values.length === 0) return NaN;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

/** Peak-to-peak, ignoring NaN. */
export function peakToPeak(values: number[]): number {
  if (values.length === 0) return NaN;
  return Math.max(...values) - Math.min(...values);
}

/**
 * Drop values further than `k` MADs from the median.
 *
 * The 1.4826 factor makes MAD comparable to a standard deviation for normally
 * distributed data, so `k` reads like a sigma count. When MAD is 0 the data is
 * already tightly clustered and everything is kept.
 */
export function rejectOutliers(values: number[], k = 3): number[] {
  if (values.length < 4) return values;
  const m = median(values);
  const scale = mad(values) * 1.4826;

  // MAD of zero means most samples are identical. Returning early here would
  // keep an obvious spike among otherwise-identical values — exactly the case
  // a MAF bin hits when one sample is bad. Keep only the median value.
  if (!Number.isFinite(scale)) return values;
  if (scale === 0) return values.filter((v) => v === m);

  return values.filter((v) => Math.abs(v - m) <= k * scale);
}
