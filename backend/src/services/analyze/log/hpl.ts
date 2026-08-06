import zlib from "node:zlib";

/**
 * Partial reader for HP Tuners VCM Scanner native logs (.hpl).
 *
 * ## What this can do
 *
 * The container is straightforward and fully decoded here: an `SS\0\0SYNC`
 * header, a channel-definition table, then a series of `CDG\0` blocks each
 * carrying a raw-deflate payload with its compressed and uncompressed lengths
 * in the header. Every block in the sample file round-trips to its declared
 * length exactly.
 *
 * ## What this deliberately does NOT do
 *
 * It does not produce channel data, because **the file does not name its
 * channels**. Each definition carries a unit string and a numeric PID, and the
 * PID resolves to a name only inside HP Tuners' own channel database, which is
 * not shipped in the log.
 *
 * In the reference file that meant 7 channels sharing the unit `%`, 4 sharing
 * `g/s`, 3 sharing `°C`, and 2 each sharing `kPa`, `V`, `mV` and `°`. There is
 * no sound way to decide which `%` is short-term fuel trim bank 1 and which is
 * bank 2, or which `°C` is coolant and which is intake air.
 *
 * Getting that wrong is not a cosmetic error. Swapping banks, or reading intake
 * air temperature as coolant temperature, produces confident findings on
 * safety-critical rules from the wrong signal — the exact failure this engine
 * is built to refuse. So the reader stops at the inventory and asks for a CSV
 * export, which carries the names.
 *
 * ## How this becomes full support
 *
 * A CSV export of the *same* drive as an .hpl would let the two be correlated
 * series-by-series, deriving a PID → name dictionary. With that dictionary in
 * place, .hpl could be read natively and customers would skip the export step.
 * Until then, naming is guesswork and this reader says so.
 */

export const HPL_MAGIC = Buffer.from([0x53, 0x53, 0x00, 0x00, 0x53, 0x59, 0x4e, 0x43]); // "SS\0\0SYNC"

export type HplChannel = {
  /** Index within the definition table. */
  slot: number;
  /** Numeric identifier. Resolves to a name only in HP Tuners' own database. */
  pid: number;
  unit: string;
  scale: number;
  offset: number;
};

export type HplInventory = {
  channels: HplChannel[];
  /** Deflate blocks found, and total decompressed size. */
  dataBlocks: number;
  decompressedBytes: number;
  /** Units seen more than once — the source of the naming ambiguity. */
  ambiguousUnits: Array<{ unit: string; count: number }>;
};

export function isHplFile(buf: Buffer): boolean {
  return buf.length >= HPL_MAGIC.length && buf.subarray(0, HPL_MAGIC.length).equals(HPL_MAGIC);
}

/**
 * Read the channel table and data-block inventory. Returns null when the file
 * is not an .hpl or the structure does not match — this reader never guesses
 * its way through a malformed file.
 */
export function readHplInventory(buf: Buffer): HplInventory | null {
  if (!isHplFile(buf)) return null;

  const firstBlock = buf.indexOf(Buffer.from("CDG\0", "latin1"));
  const tableEnd = firstBlock === -1 ? buf.length : firstBlock;

  // Channel definitions: 0x0a tag, f64 scale, f64 offset, u16be unit length,
  // unit bytes (UTF-8), then 5 bytes carrying the slot and PID.
  const channels: HplChannel[] = [];
  let i = 0x1e;
  while (i < tableEnd - 24) {
    if (buf[i] !== 0x0a) {
      i++;
      continue;
    }
    const scale = buf.readDoubleLE(i + 1);
    const offset = buf.readDoubleLE(i + 9);
    const slen = buf.readUInt16BE(i + 17);
    if (slen > 8) {
      i++;
      continue;
    }
    const unit = buf.subarray(i + 19, i + 19 + slen).toString("utf8");
    const tail = buf.subarray(i + 19 + slen, i + 19 + slen + 5);
    if (tail.length < 5) break;

    channels.push({
      slot: tail.readUInt8(0),
      pid: tail.readUInt16LE(2),
      unit,
      scale,
      offset
    });
    i = i + 19 + slen + 5;
  }

  if (channels.length === 0) return null;

  // Data blocks. Each decompresses independently; a block that fails is
  // counted but not fabricated around.
  let dataBlocks = 0;
  let decompressedBytes = 0;
  let pos = buf.indexOf(Buffer.from("CDG\0", "latin1"));
  while (pos !== -1) {
    if (pos + 12 > buf.length) break;
    const clen = buf.readUInt32LE(pos + 4);
    if (clen > 0 && pos + 12 + clen <= buf.length) {
      try {
        decompressedBytes += zlib.inflateRawSync(buf.subarray(pos + 12, pos + 12 + clen)).length;
        dataBlocks++;
      } catch {
        // Malformed block: counted by omission, never guessed at.
      }
    }
    pos = buf.indexOf(Buffer.from("CDG\0", "latin1"), pos + 4);
  }

  const counts = new Map<string, number>();
  for (const c of channels) {
    if (!c.unit) continue;
    counts.set(c.unit, (counts.get(c.unit) ?? 0) + 1);
  }
  const ambiguousUnits = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([unit, count]) => ({ unit, count }))
    .sort((a, b) => b.count - a.count);

  return { channels, dataBlocks, decompressedBytes, ambiguousUnits };
}

/**
 * The message a customer sees. Reports what was actually found in their file,
 * then the single step that makes it usable.
 */
export function describeHpl(inv: HplInventory): string {
  const named = inv.ambiguousUnits
    .slice(0, 3)
    .map((a) => `${a.count} share "${a.unit}"`)
    .join(", ");

  return (
    `This is an HP Tuners VCM Scanner log (.hpl). It was read successfully — ` +
    `${inv.channels.length} channels and ${inv.dataBlocks} data blocks — but .hpl files ` +
    `identify their channels by number, not by name, and the names live in HP Tuners' ` +
    `own database rather than in the log. ` +
    (named ? `In this file ${named}, ` : "") +
    `so there is no reliable way to tell which is which, and guessing on a fuel-trim or ` +
    `temperature channel would produce confident but wrong results. ` +
    `Please export the same log to CSV — in VCM Scanner, File → Export → CSV — and upload ` +
    `that. The CSV carries the channel names.`
  );
}
