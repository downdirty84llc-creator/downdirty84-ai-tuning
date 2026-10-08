export const MAX_TUNE_BYTES = 32 * 1024 * 1024;
const text = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error(`Invalid ${label}.`);
  return value.trim();
};
export async function fingerprint(file) {
  const name = text(file.name, 255, 'filename');
  if (!/\.hpt$/i.test(name)) throw Error('Select an HPT calibration file. Log files are not calibrations.');
  if (!Number.isInteger(file.size) || file.size < 4 || file.size > MAX_TUNE_BYTES) throw Error('HPT file must be between 4 bytes and 32 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size) throw Error('File length changed while reading.');
  if (bytes[0] !== 72 || bytes[1] !== 80 || bytes[2] !== 84 || bytes[3] !== 32) throw Error('Unrecognized HPT header. No calibration data was decoded.');
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return {name, bytes: bytes.length, sha256: [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('')};
}
function identity(value) {
  if (!value || typeof value !== 'object') throw Error('Missing file identity.');
  const name = text(value.name, 255, 'filename');
  if (!/\.hpt$/i.test(name) || /[\\/]/.test(name)) throw Error('Expected an HPT basename.');
  if (!Number.isInteger(value.bytes) || value.bytes < 4 || value.bytes > MAX_TUNE_BYTES || !/^[a-f0-9]{64}$/.test(value.sha256)) throw Error('Invalid file fingerprint.');
  return {name, bytes: value.bytes, sha256: value.sha256};
}
export function makeCase(vehicle, build, original, final) {
  return {format:'DD84_FILE_PAIR_V1', status:'READ_ONLY_NOT_RELEASED', vehicle:text(vehicle,160,'vehicle description'), build:text(build,4000,'build notes'), original:identity(original), final:identity(final), tableComparison:'NOT_DECODED'};
}
export function parseCase(raw) {
  if (new TextEncoder().encode(raw).length > 16384) throw Error('Case record exceeds 16 KB.');
  const c = JSON.parse(raw);
  if (c?.format !== 'DD84_FILE_PAIR_V1' || c.status !== 'READ_ONLY_NOT_RELEASED' || c.tableComparison !== 'NOT_DECODED') throw Error('Unsupported case record.');
  return makeCase(c.vehicle,c.build,c.original,c.final);
}
export function matchFile(expected, actual) {
  expected=identity(expected);actual=identity(actual);
  return expected.bytes === actual.bytes && expected.sha256 === actual.sha256;
}
