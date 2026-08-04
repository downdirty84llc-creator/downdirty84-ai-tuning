/**
 * Canonical channel vocabulary.
 *
 * Rules never reference a vendor column name. They reference a canonical
 * channel, and this registry resolves vendor names onto it — so supporting a
 * new toolchain, or a column someone renamed, is a registry entry rather than a
 * code change.
 *
 * The aliases below are seeded from HP Tuners and Holley documentation, not
 * from a file that came off a real car. Anything unmatched is reported by name
 * in validation rather than silently dropped, so a wrong alias shows up as
 * "unmapped column" instead of a wrong finding.
 */

export type Channel =
  | "t"
  | "rpm"
  | "tps"
  | "map"
  | "maf_hz"
  | "maf_gs"
  | "afr_wb"
  | "afr_cmd"
  | "stft_b1"
  | "stft_b2"
  | "ltft_b1"
  | "ltft_b2"
  | "kr"
  | "ect"
  | "iat"
  | "fuel_press"
  | "inj_duty";

export type ChannelSpec = {
  channel: Channel;
  label: string;
  unit: string;
  /** Values outside this range are treated as sensor dropout, not data. */
  plausible: [number, number];
  aliases: string[];
};

/**
 * Alias matching is done on a normalised form: lowercased, with everything
 * that is not a letter or digit removed. So "SAE.RPM", "Engine Speed" and
 * "rpm " all reduce to comparable keys.
 */
export function normaliseName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const CHANNELS: ChannelSpec[] = [
  {
    channel: "t",
    label: "Time",
    unit: "s",
    plausible: [0, 86_400],
    aliases: ["time", "times", "timestamp", "offset", "sae.time", "elapsedtime", "seconds"]
  },
  {
    channel: "rpm",
    label: "Engine speed",
    unit: "rpm",
    plausible: [0, 12_000],
    aliases: ["rpm", "saerpm", "enginerpm", "enginespeed", "engspeed", "rpmengine"]
  },
  {
    channel: "tps",
    label: "Throttle position",
    unit: "%",
    plausible: [0, 100],
    aliases: ["tps", "saetps", "throttle", "throttleposition", "tp", "pedalposition", "app", "accelpedal"]
  },
  {
    channel: "map",
    label: "Manifold pressure",
    unit: "kPa",
    plausible: [0, 500],
    aliases: ["map", "saemap", "manifoldpressure", "manifoldabsolutepressure", "mapkpa"]
  },
  {
    channel: "maf_hz",
    label: "MAF frequency",
    unit: "Hz",
    plausible: [0, 20_000],
    aliases: ["maffreq", "maffrequency", "mafhz", "massairflowfrequency", "maffrequencyhz"]
  },
  {
    channel: "maf_gs",
    label: "MAF airflow",
    unit: "g/s",
    plausible: [0, 1500],
    aliases: ["maf", "saemaf", "massairflow", "mafgs", "airflow", "mafgsec"]
  },
  {
    channel: "afr_wb",
    label: "Wideband AFR",
    unit: "AFR",
    plausible: [5, 30],
    aliases: [
      "wbafr", "widebandafr", "wideband", "afrwideband", "afrwb", "wo2", "wbo2",
      "widebandlambda", "lambdawideband", "wblambda", "afr1", "wbafr1"
    ]
  },
  {
    channel: "afr_cmd",
    label: "Commanded AFR",
    unit: "AFR",
    plausible: [5, 30],
    aliases: [
      "afrcmd", "commandedafr", "afrcommanded", "targetafr", "afrtarget",
      "commandedequivalenceratio", "eqratiocmd", "lambdacmd", "commandedlambda"
    ]
  },
  {
    channel: "stft_b1",
    label: "STFT bank 1",
    unit: "%",
    plausible: [-50, 50],
    aliases: ["stftb1", "stft1", "shorttermfueltrimbank1", "sttrimb1", "shorttermft1", "stftbank1"]
  },
  {
    channel: "stft_b2",
    label: "STFT bank 2",
    unit: "%",
    plausible: [-50, 50],
    aliases: ["stftb2", "stft2", "shorttermfueltrimbank2", "sttrimb2", "shorttermft2", "stftbank2"]
  },
  {
    channel: "ltft_b1",
    label: "LTFT bank 1",
    unit: "%",
    plausible: [-50, 50],
    aliases: ["ltftb1", "ltft1", "longtermfueltrimbank1", "lttrimb1", "longtermft1", "ltftbank1"]
  },
  {
    channel: "ltft_b2",
    label: "LTFT bank 2",
    unit: "%",
    plausible: [-50, 50],
    aliases: ["ltftb2", "ltft2", "longtermfueltrimbank2", "lttrimb2", "longtermft2", "ltftbank2"]
  },
  {
    channel: "kr",
    label: "Knock retard",
    unit: "deg",
    plausible: [0, 40],
    aliases: ["kr", "knockretard", "totalknockretard", "knock", "ignitionretard", "sparkretard", "krtotal"]
  },
  {
    channel: "ect",
    label: "Coolant temp",
    unit: "C",
    plausible: [-40, 200],
    aliases: ["ect", "saeect", "coolanttemp", "coolant", "enginecoolanttemp", "clt", "watertemp"]
  },
  {
    channel: "iat",
    label: "Intake air temp",
    unit: "C",
    plausible: [-40, 200],
    aliases: ["iat", "saeiat", "intakeairtemp", "intaketemp", "act", "chargetemp", "mat"]
  },
  {
    channel: "fuel_press",
    label: "Fuel pressure",
    unit: "psi",
    plausible: [0, 200],
    aliases: ["fuelpress", "fuelpressure", "fuelrailpressure", "fuelpsi", "railpressure", "fp"]
  },
  {
    channel: "inj_duty",
    label: "Injector duty",
    unit: "%",
    plausible: [0, 130],
    aliases: ["injduty", "injectorduty", "injectordutycycle", "idc", "dutycycle", "injpw duty"]
  }
];

const ALIAS_INDEX: Map<string, Channel> = (() => {
  const m = new Map<string, Channel>();
  for (const spec of CHANNELS) {
    m.set(normaliseName(spec.channel), spec.channel);
    for (const a of spec.aliases) {
      const key = normaliseName(a);
      // First registration wins, so a generic alias cannot steal a specific
      // one that was declared earlier (e.g. "maf" must not capture "maffreq").
      if (!m.has(key)) m.set(key, spec.channel);
    }
  }
  return m;
})();

export const CHANNEL_SPEC: Record<Channel, ChannelSpec> = Object.fromEntries(
  CHANNELS.map((c) => [c.channel, c])
) as Record<Channel, ChannelSpec>;

/**
 * Resolve a vendor column name to a canonical channel, or null if unknown.
 *
 * Matching is exact-on-normalised-form only. Substring or fuzzy matching was
 * considered and rejected: "Fuel Pressure Desired" contains "fuelpress", and
 * mapping a desired value onto the measured channel would produce a confident,
 * wrong fuel-delivery finding.
 */
export function resolveChannel(columnName: string): Channel | null {
  return ALIAS_INDEX.get(normaliseName(columnName)) ?? null;
}

/** Channels without which no useful analysis is possible. */
export const REQUIRED_CHANNELS: Channel[] = ["t", "rpm"];

/** Channels that unlock specific rules or diffgen when present. */
export const OPTIONAL_CHANNELS: Channel[] = CHANNELS.map((c) => c.channel).filter(
  (c) => !REQUIRED_CHANNELS.includes(c)
);

export function isPlausible(channel: Channel, value: number): boolean {
  const [lo, hi] = CHANNEL_SPEC[channel].plausible;
  return Number.isFinite(value) && value >= lo && value <= hi;
}

/**
 * Lambda is sometimes logged where AFR is expected. Values clustered near 1.0
 * on an AFR channel are lambda, and 14.7 is the stoichiometric conversion for
 * gasoline. Diesel and E85 have different stoich points, which is why this
 * returns the assumption it made rather than silently converting.
 */
export function detectLambda(values: number[]): boolean {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return false;
  const inLambdaRange = finite.filter((v) => v > 0.5 && v < 1.6).length;
  return inLambdaRange / finite.length > 0.9;
}

export const STOICH_GASOLINE = 14.7;
