export type Capture = {
  id: string; startedAt: string; endedAt: string | null;
  received: number; dropped: number; reason: string | null;
};
export type CaptureState = {
  connection: 'disconnected' | 'connected' | 'fault';
  active: Capture | null; history: Capture[];
};
export type CaptureAction =
  | { type: 'connect' }
  | { type: 'start'; id: string; at: string }
  | { type: 'tick' | 'drop' | 'stop' | 'disconnect' | 'fault' | 'hidden'; at: string };
export const initialCaptureState: CaptureState = { connection: 'disconnected', active: null, history: [] };
export const CAPTURE_LIMIT = 10_000;
function finish(state: CaptureState, at: string, reason: string): CaptureState {
  if (!state.active) return state;
  return { ...state, active: null, history: [{...state.active, endedAt: at, reason}, ...state.history].slice(0,20) };
}
// Browser-only rehearsal. No device API, wire transport, vehicle data or storage.
export function captureReducer(state: CaptureState, action: CaptureAction): CaptureState {
  switch (action.type) {
    case 'connect': return state.connection === 'connected' ? state : {...state, connection:'connected'};
    case 'start':
      if (state.connection !== 'connected' || state.active) return state;
      return {...state, active:{id:action.id, startedAt:action.at, endedAt:null, received:0, dropped:0, reason:null}};
    case 'tick':
    case 'drop': {
      if (state.connection !== 'connected' || !state.active) return state;
      const count = Math.min(action.type === 'tick' ? 100 : 5,
        CAPTURE_LIMIT-state.active.received-state.active.dropped);
      const active = {...state.active,
        received:state.active.received+(action.type === 'tick'?count:0),
        dropped:state.active.dropped+(action.type === 'drop'?count:0)};
      const next={...state,active};
      return active.received+active.dropped >= CAPTURE_LIMIT ? finish(next,action.at,'Demo limit reached') : next;
    }
    case 'stop': return finish(state,action.at,'Stopped by you');
    case 'hidden': return finish(state,action.at,'Stopped when the page was hidden');
    case 'disconnect': return {...finish(state,action.at,'Simulated disconnect'),connection:'disconnected'};
    case 'fault': return {...finish(state,action.at,'Simulated connection fault'),connection:'fault'};
  }
}
export function captureReport(capture: Capture) {
  return {schemaVersion:1, source:'BROWSER_SIMULATION', device:'DD84-DEMO',
    writeStrategy:'SIMULATION_ONLY', physicalValidation:'NOT_RUN',
    ...capture, generated:capture.received+capture.dropped, hardwareOverruns:null,
    note:'Synthetic counters only. No raw CAN frames, vehicle data or hardware measurements. Not a cloud telemetry upload.'};
}
