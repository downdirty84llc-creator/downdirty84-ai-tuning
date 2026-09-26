import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fingerprint,makeCase,parseCase,matchFile,MAX_TUNE_BYTES} from './filePair.mjs';
const file=(name,bytes)=>({name,size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
test('fingerprint pair, save/reopen and verify exact content independent of name',async()=>{
  const a=await fingerprint(file('original.hpt',[72,80,84,32,1]));
  const b=await fingerprint(file('final.hpt',[72,80,84,32,2]));
  assert.notEqual(a.sha256,b.sha256);
  const c=makeCase('Test vehicle','Owner-reported cam and headers',a,b);
  assert.deepEqual(parseCase(JSON.stringify(c)),c);
  assert.equal(matchFile(c.original,{...a,name:'renamed.hpt'}),true);
  assert.equal(matchFile(c.original,b),false);
  assert.equal(c.tableComparison,'NOT_DECODED');
});
test('reject invalid files before allocation and unsupported case formats',async()=>{
  for(const f of [file('log.hpl',[72,80,84,32]),file('bad.hpt',[1,2,3,4]),file('tiny.hpt',[72]),{name:'big.hpt',size:MAX_TUNE_BYTES+1,arrayBuffer(){throw Error('should not read');}}])await assert.rejects(fingerprint(f));
  const a=await fingerprint(file('a.hpt',[72,80,84,32]));const c=makeCase('Test','Notes',a,a);
  for(const patch of [{status:'RELEASED'},{tableComparison:'VERIFIED'},{original:{...a,sha256:'bad'}},{vehicle:''},{build:'x'.repeat(4001)}])assert.throws(()=>parseCase(JSON.stringify({...c,...patch})));
  assert.throws(()=>parseCase(' '.repeat(16385)));
});
