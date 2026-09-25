// Local capture codec. CRC detects corruption; it does not authenticate a device.
export const WIRE_SIZE = 112;
export const FD_LENGTHS = [0,1,2,3,4,5,6,7,8,12,16,20,24,32,48,64];
const magic = Buffer.from('D84W');
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function decodeRecord(b) {
  if (b.length !== WIRE_SIZE || !b.subarray(0,4).equals(magic) ||
      b[4] !== 1 || b.readUInt16LE(6) !== WIRE_SIZE || ![1,2].includes(b[5]))
    throw new Error('header');
  if (crc32(b.subarray(0,108)) !== b.readUInt32LE(108)) throw new Error('crc');
  const session = b.readBigUInt64LE(8).toString();
  if (session === '0') throw new Error('session');
  const result = {type: b[5] === 1 ? 'frame' : 'status', session,
    sequence: b.readUInt32LE(16), timestampUs: b.readBigUInt64LE(20).toString()};
  let padding;
  if (b[5] === 1) {
    const id = b.readUInt32LE(28), channel = b[32], flags = b[33], dlc = b[34], length = b[35];
    const extended = !!(flags&1), fd = !!(flags&2), brs = !!(flags&4);
    if (flags > 7 || channel > 1 || id > (extended ? 0x1fffffff : 0x7ff) ||
        dlc > 15 || (!fd && (brs || dlc > 8)) || FD_LENGTHS[dlc] !== length)
      throw new Error('frame');
    Object.assign(result,{id,channel,extended,fd,brs,dlc,length,data:b.subarray(36,36+length).toString('hex')});
    padding = 36 + length;
  } else {
    const names = ['accepted','drained','droppedFull','rejectedInvalid','rejectedNotReady','rejectedTimestamp','queued','highWater'];
    const values = names.map((_,i) => b.readBigUInt64LE(28+i*8));
    if (values[0] !== values[1]+values[6] || values[6] > values[7] || values[7] > 256n)
      throw new Error('status');
    result.counters = Object.fromEntries(names.map((name,i) => [name,values[i].toString()]));
    result.hardwareOverruns = null; // Not measured by this software queue.
    padding = 92;
  }
  if (b.subarray(padding,108).some(byte => byte !== 0)) throw new Error('padding');
  return result;
}

// Explicit session binding prevents reconnects from silently mixing captures.
// At most 112 retained bytes. Each feed is bounded to 4096 bytes.
export class WireParser {
  #buffer = Buffer.alloc(WIRE_SIZE); #used = 0; #session; #next = 0;
  #lastTimestamp = 0n;
  constructor(session) {
    const value = BigInt(session);
    if (value <= 0n || value > 0xffffffffffffffffn) throw new Error('invalid session');
    this.#session = value.toString();
  }
  get bufferedBytes() { return this.#used; }
  disconnect() {
    const discarded = this.#used; this.#used = 0;
    return {type:'disconnect',discardedBytes:discarded};
  }
  feed(chunk) {
    if (!(chunk instanceof Uint8Array) || chunk.length > 4096) throw new Error('chunk limit');
    const events = [];
    let discardedBytes = 0;
    for (const byte of chunk) {
      this.#buffer[this.#used++] = byte;
      while (this.#used >= 4 && !this.#buffer.subarray(0,4).equals(magic)) {
        this.#buffer.copyWithin(0,1,this.#used); this.#used--;
        discardedBytes++;
      }
      if (this.#used !== WIRE_SIZE) continue;
      let record;
      try { record = decodeRecord(this.#buffer); }
      catch (error) {
        events.push({type:'invalid',reason:error.message});
        this.#buffer.copyWithin(0,1); this.#used--; discardedBytes++; continue;
      }
      this.#used = 0;
      if (record.session !== this.#session) { events.push({type:'wrongSession',session:record.session}); continue; }
      if (record.sequence < this.#next) { events.push({type:'duplicateOrStale',sequence:record.sequence}); continue; }
      if (BigInt(record.timestampUs) < this.#lastTimestamp) { events.push({type:'timestampRegression',sequence:record.sequence}); continue; }
      if (record.sequence > this.#next) events.push({type:'gap',from:this.#next,to:record.sequence-1,count:record.sequence-this.#next});
      this.#next = record.sequence + 1; // 2^32 is deliberately not wrapped.
      this.#lastTimestamp = BigInt(record.timestampUs);
      events.push(record);
    }
    if (discardedBytes) events.push({type:'discardedBytes',count:discardedBytes});
    return events;
  }
}
