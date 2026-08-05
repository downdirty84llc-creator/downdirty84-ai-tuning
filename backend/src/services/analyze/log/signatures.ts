/**
 * Known non-datalog file signatures.
 *
 * Customers send calibration files when asked for a log more often than they
 * send logs. The tune is the artefact they think of as "their tune", it lives
 * in the same folder, and in HP Tuners' case the extensions differ by a single
 * letter (.hpt vs .hpl). Every one of these arrives as "the file", and a
 * parser error about a missing header row tells them nothing.
 *
 * Each entry identifies the artefact by name and says what to send instead.
 * Adding a vendor is a row here, not new logic.
 */

export type TuneSignature = {
  id: string;
  /** Leading bytes that identify the format. */
  magic: Buffer;
  /** What the file actually is, in the customer's language. */
  what: string;
  /** The specific step that produces an analysable log for this toolchain. */
  instead: string;
};

export const TUNE_SIGNATURES: TuneSignature[] = [
  {
    id: "HPT_TUNE",
    magic: Buffer.from("HPT ", "latin1"),
    what:
      "an HP Tuners tune file (.hpt) — the calibration itself, not a datalog. It holds the " +
      "tables that live in the vehicle, not any recorded driving, so there is nothing in it " +
      "to analyse",
    instead:
      "In VCM Scanner, open your recorded log and use File → Export → CSV, then upload that file."
  },
  {
    id: "TERX_TUNE",
    // 0xDEEDBEAF little-endian. FAST / Holley Terminator X calibration.
    magic: Buffer.from([0xaf, 0xbe, 0xed, 0xde]),
    what:
      "a Holley / FAST Terminator X calibration (.terx) — the tune itself, not a datalog. It " +
      "holds fuel, spark, sensor and transmission tables, not any recorded driving",
    instead:
      "In Holley EFI software, open the datalog and export it to CSV, then upload that file. " +
      "Terminator X logs are usually recorded to the handheld or laptop and saved separately " +
      "from the calibration."
  }
];

export function matchTuneSignature(buf: Buffer): TuneSignature | null {
  for (const sig of TUNE_SIGNATURES) {
    if (buf.length >= sig.magic.length && buf.subarray(0, sig.magic.length).equals(sig.magic)) {
      return sig;
    }
  }
  return null;
}

export function describeTuneFile(sig: TuneSignature): string {
  return `This is ${sig.what}. ${sig.instead}`;
}
