import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'dd84-ui-test-'));
try {
  const result=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','src/linkCapture.ts',
    '--target','ES2022','--module','ES2022','--moduleResolution','bundler','--skipLibCheck','--outDir',dir],{encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
  const {captureReducer:r,initialCaptureState:initial,captureReport}=await import('data:text/javascript;base64,'+Buffer.from(readFileSync(join(dir,'linkCapture.js'))).toString('base64'));
  const at='2026-09-25T12:00:00.000Z';
  const action=type=>({type,at});
  let state=r(initial,{type:'start',id:'ignored',at});assert.equal(state,initial);
  state=r(state,action('connect'));state=r(state,{type:'start',id:'first',at});
  state=r(state,action('tick'));state=r(state,action('drop'));
  assert.equal(state.active.received,100);assert.equal(state.active.dropped,5);
  state=r(state,action('fault'));assert.equal(state.active,null);assert.equal(state.connection,'fault');
  assert.equal(r(state,action('tick')),state);
  assert.equal(r(state,{type:'start',id:'blocked',at}),state);
  const report=captureReport(state.history[0]);
  assert.equal(report.generated,105);assert.equal(report.source,'BROWSER_SIMULATION');
  assert.equal(report.hardwareOverruns,null);assert.equal(report.writeStrategy,'SIMULATION_ONLY');
  for(const ending of ['stop','disconnect','hidden']) {
    state=r(state,action('connect'));state=r(state,{type:'start',id:ending,at});
    assert.equal(state.active.received,0);assert.equal(state.active.dropped,0);
    state=r(state,action(ending));assert.equal(state.active,null);assert.ok(state.history[0].endedAt);
  }
  state=r(state,action('connect'));state=r(state,{type:'start',id:'limit',at});
  state=r(state,action('drop'));
  for(let i=0;i<101;i++)state=r(state,action('tick'));
  assert.equal(state.history[0].received,9995);assert.equal(state.history[0].dropped,5);
  for(let i=0;i<30;i++) {
    state=r(state,{type:'start',id:'bounded-'+i,at});state=r(state,action('stop'));
  }
  assert.equal(state.history.length,20);assert.equal(state.history[0].id,'bounded-29');
  console.log('PASS: capture guards, faults, reconnects, reporting, page hiding and bounded history');
} finally { rmSync(dir,{recursive:true,force:true}); }
