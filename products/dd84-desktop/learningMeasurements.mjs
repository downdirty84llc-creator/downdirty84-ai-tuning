import {logReport} from './logs.mjs';
import {channelTimeline} from './timeline.mjs';
import {compareOperatingContext} from './operatingContext.mjs';
import {compareOperatingBand} from './operatingBand.mjs';

export const measurementRoles = ['EARLIER_LOG', 'BEFORE_FINAL_LOG', 'AFTER_FINAL_LOG'];
const channelRoles = new Set(['RPM', 'MAP', 'COMMANDED_LAMBDA', 'MEASURED_LAMBDA',
  'MAF_FREQUENCY', 'MAF_MASS_FLOW', 'INTAKE_TEMPERATURE', 'COOLANT_TEMPERATURE',
  'KNOCK_RETARD', 'SPARK_ADVANCE']);
const receipts = new WeakMap();
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error(`Invalid ${label}.`);
  return value.trim();
}
function hash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw Error('Invalid measurement fingerprint.');
  return value;
}
export function measurementReference(value) {
  if (!value || !measurementRoles.includes(value.role)) throw Error('Choose a CSV timeline role.');
  const name = text(value.source?.name, 255, 'CSV filename');
  if (/[\\/]/.test(name) || !name.toLowerCase().endsWith('.csv') ||
      value.source?.hashScope !== 'UTF8_DECODED_TEXT') throw Error('Unsupported CSV source reference.');
  if (!Array.isArray(value.selections) || !value.selections.length || value.selections.length > 10)
    throw Error('Review at least one channel in Recorded logs before attaching it.');
  const seen = new Set();
  const selections = value.selections.map(s => {
    if (!s || !channelRoles.has(s.role) || seen.has(s.role)) throw Error('Invalid or duplicate measurement role.');
    seen.add(s.role);
    text(s.channelId, 4096, 'channel identifier');
    return {role: s.role, channelId: s.channelId,
      evidence: text(s.evidence, 2000, 'channel selection evidence')};
  });
  return {role: value.role, source: {name, textSha256: hash(value.source.textSha256), hashScope: 'UTF8_DECODED_TEXT'},
    calibration: {sha256: hash(value.calibration?.sha256), note: text(value.calibration?.note, 2000, 'calibration association note')},
    selections, note: text(value.note, 2000, 'CSV timeline note')};
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function receipt(reference, report, raw) {
  const result = freeze({reference, report});
  receipts.set(result, {key: JSON.stringify(reference), raw});
  return result;
}
// Only source-derived in-session receipts count as checked. Saved metadata cannot create one.
export function checkedMeasurement(reference, candidates = []) {
  const key = JSON.stringify(measurementReference(reference));
  return candidates.find(candidate => receipts.get(candidate)?.key === key)?.report ?? null;
}
// Raw text stays private and in memory. Only a matching source receipt can summarize a window.
export function measurementWindow(reference, candidates, channelRole, range) {
  const key = JSON.stringify(measurementReference(reference));
  const candidate = candidates.find(item => receipts.get(item)?.key === key);
  if (!candidate) throw Error('Recheck both source CSVs in this session before comparing.');
  const channel = candidate.report.channelSelection.entries.find(s => s.role === channelRole);
  if (!channel) throw Error('Select the same reviewed channel role in both CSVs first.');
  if (!range) throw Error('Choose an explicit time window for each recording.');
  return channelTimeline(receipts.get(candidate).raw, channel.channelId, range);
}
function comparisonInputs(before, after, candidates, beforeRange, afterRange) {
  return [before,after].map((reference,index)=>{
    const key=JSON.stringify(measurementReference(reference));
    const candidate=candidates.find(item=>receipts.get(item)?.key===key);
    if(!candidate)throw Error('Recheck both source CSVs in this session before comparing.');
    return {raw:receipts.get(candidate).raw,selections:candidate.report.channelSelection.entries,
      range:index===0?beforeRange:afterRange};
  });
}
export function measurementContext(before, after, candidates, beforeRange, afterRange) {
  return compareOperatingContext(...comparisonInputs(before,after,candidates,beforeRange,afterRange));
}
export function measurementBand(before, after, candidates, beforeRange, afterRange, channelRole, band) {
  return compareOperatingBand(...comparisonInputs(before,after,candidates,beforeRange,afterRange),channelRole,band);
}
export async function captureLearningMeasurement(input, role, note) {
  // logReport snapshots selections before hashing; primitives and timeline note are captured here.
  const {raw, name, tuneSha256, associationNote, selections} = input;
  if (!measurementRoles.includes(role)) throw Error('Choose a CSV timeline role.');
  if (!tuneSha256) throw Error('Enter the exact tune fingerprint and association note in Recorded logs first.');
  const timelineNote = text(note, 2000, 'CSV timeline note');
  const report = await logReport(raw, name, tuneSha256, associationNote, selections);
  const reference = measurementReference({role, source: report.source, calibration: report.calibration,
    selections: report.channelSelection.entries, note: timelineNote});
  return receipt(reference, report, raw);
}
export async function recheckLearningMeasurement(value, raw, name) {
  const reference = measurementReference(value);
  const report = await logReport(raw, name, reference.calibration.sha256,
    reference.calibration.note, reference.selections);
  if (report.source.textSha256 !== reference.source.textSha256)
    throw Error('CSV contents do not match this learning reference. Existing evidence was retained.');
  return receipt(reference, report, raw);
}
export function measurementCoverage(reference, candidates = []) {
  const report = checkedMeasurement(reference, candidates);
  if (!report) return {role: reference.role, sourceStatus: 'SOURCE_RECHECK_REQUIRED', rows: null,
    selected: [], unselected: [], learningReady: false};
  return {role: reference.role, sourceStatus: 'SOURCE_RECHECKED', rows: report.rowCount,
    selected: report.channelSelection.entries.map(s => {
      const c = report.channels.find(c => c.id === s.channelId);
      return {role: s.role, name: c.name, unit: c.unit, numericCount: c.numericCount,
        missingCount: c.missingCount, textCount: c.textCount, flags: [...s.flags]};
    }), unselected: [...report.channelSelection.unselectedRoles], learningReady: false};
}
