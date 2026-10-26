import {makeLearningCase} from './learning.mjs';
import {measurementRoles,measurementReference,measurementWindow,measurementContext,measurementBand} from './learningMeasurements.mjs';
import {operatingBandSelection} from './operatingBand.mjs';
import {runSetupSelection,savedRunSetupSelection,reviewRunSetup} from './runSetup.mjs';

export const MAX_LEARNING_COMPARISON_BYTES = 1024 * 1024;
const method = 'INDEPENDENT_CHANNEL_WINDOWS_V1';
const hashScope = 'CANONICAL_LEARNING_CASE_V2_JSON';
async function fingerprint(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}
function side(c, receipts, role, channelRole, range) {
  const reference = c.measurements.find(m => m.role === role);
  if (!reference) throw Error('Attach a reviewed CSV for each selected stage.');
  return {reference, timeline: measurementWindow(reference, receipts, channelRole, range)};
}
export async function compareLearningWindows(input, receipts, options) {
  // Snapshot the entire case and both source-derived summaries before asynchronous hashing.
  const c = makeLearningCase(input);
  if (!options || typeof options !== 'object') throw Error('Choose two stages, a channel and time windows.');
  const {beforeRole,afterRole,channelRole,beforeRange,afterRange} = options;
  const note = options.note;
  if (typeof note !== 'string' || !note.trim() || note.length > 2000)
    throw Error('Describe the selected windows and known differences in conditions (up to 2,000 characters).');
  if (!measurementRoles.includes(beforeRole) || !measurementRoles.includes(afterRole) ||
      measurementRoles.indexOf(beforeRole) >= measurementRoles.indexOf(afterRole))
    throw Error('Choose two different stages in timeline order.');
  const before = side(c, receipts, beforeRole, channelRole, beforeRange);
  const after = side(c, receipts, afterRole, channelRole, afterRange);
  if (before.timeline.channel.unit !== after.timeline.channel.unit)
    throw Error('The selected channels must have identical exported units. No unit conversion is performed.');
  const selection = {beforeRole,afterRole,channelRole,
    beforeRange:{start:before.timeline.time.first,end:before.timeline.time.last},
    afterRange:{start:after.timeline.time.first,end:after.timeline.time.last},
    operatingBand:operatingBandSelection(options.operatingBand),runSetup:runSetupSelection(options.runSetup)};
  const operatingContext=measurementContext(before.reference,after.reference,receipts,selection.beforeRange,selection.afterRange);
  const operatingBand=selection.operatingBand?measurementBand(before.reference,after.reference,receipts,
    selection.beforeRange,selection.afterRange,channelRole,selection.operatingBand):null;
  const runSetup={...reviewRunSetup(selection.runSetup),sourceBindings:Object.fromEntries(
    Object.entries({before,after}).map(([side,value])=>[side,{stage:value.reference.role,
      csvSha256:value.reference.source.textSha256,tuneSha256:value.reference.calibration.sha256}]))};
  return {
    format:'DD84_LEARNING_COMPARISON_V4',status:'EVIDENCE_ONLY_NOT_RELEASED',writeStrategy:'SIMULATION_ONLY',
    method,learningCase:{sha256:await fingerprint(c),hashScope},vehicle:c.vehicle,
    selection,note:note.trim(),noteProvenance:'OPERATOR_SUPPLIED_NOT_VERIFIED',before,after,operatingContext,operatingBand,runSetup,
    learningReady:false,automaticApplication:false,
    limitations:[
      'Each window is summarized independently in its own recording-offset seconds; both endpoints are included.',
      'Export rows are not a uniform sampling rate. Repeated timestamps are counted; missing and nonnumeric values are not filled.',
      'No time alignment, interpolation, sensor-delay correction, unit conversion or operating-condition matching is performed.',
      'Minima and maxima are independent observations, not matched samples, correction factors or performance gains.',
      'Channel choices, tune associations, chronology and review notes remain operator statements; sensors and native tunes are not authenticated.',
      'Retain the learning case and both CSVs. Reopening requires the same case fingerprint and rechecked sources; saved statistics are recomputed.',
      'No automatic learning, calibration changes or ECU writes are enabled.'
    ]
  };
}
export async function reopenLearningComparison(saved, input, receipts) {
  if (typeof saved !== 'string' || new TextEncoder().encode(saved).length > MAX_LEARNING_COMPARISON_BYTES)
    throw Error('Saved log-window comparison exceeds 1 MB.');
  const value = JSON.parse(saved);
  if (!['DD84_LEARNING_COMPARISON_V1','DD84_LEARNING_COMPARISON_V2','DD84_LEARNING_COMPARISON_V3','DD84_LEARNING_COMPARISON_V4'].includes(value?.format) || value.status !== 'EVIDENCE_ONLY_NOT_RELEASED' ||
      value.writeStrategy !== 'SIMULATION_ONLY' || value.method !== method || value.learningReady !== false ||
      value.automaticApplication !== false || value.noteProvenance !== 'OPERATOR_SUPPLIED_NOT_VERIFIED' ||
      value.learningCase?.hashScope !== hashScope || typeof value.learningCase.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.learningCase.sha256)) throw Error('Unsupported log-window comparison.');
  const hasBand=['DD84_LEARNING_COMPARISON_V3','DD84_LEARNING_COMPARISON_V4'].includes(value.format);
  if(hasBand&&(!value.selection||!Object.hasOwn(value.selection,'operatingBand')))
    throw Error('Saved comparison is missing its operating-band selection.');
  const result = await compareLearningWindows(input, receipts, {...value.selection,note:value.note,
    operatingBand:hasBand?value.selection.operatingBand:null,
    runSetup:value.format==='DD84_LEARNING_COMPARISON_V4'?savedRunSetupSelection(value.selection?.runSetup):null});
  if (value.learningCase.sha256 !== result.learningCase.sha256)
    throw Error('Open the matching learning case before restoring this comparison.');
  for (const side of ['before','after']) {
    if (JSON.stringify(measurementReference(value[side]?.reference)) !== JSON.stringify(result[side].reference))
      throw Error('Comparison source references do not match the current case.');
  }
  return result;
}
