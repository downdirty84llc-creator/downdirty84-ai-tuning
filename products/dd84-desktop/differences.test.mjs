import {test} from 'node:test';
import assert from 'node:assert/strict';
import {csvRows,parseDifferences,summarizeDifferences,differenceReport,MAX_DIFFERENCE_BYTES} from './differences.mjs';
import {makeCase} from './filePair.mjs';
const fixture='"Synthetic table","Synthetic description"\r\n"deg","0","0","rpm"\r\n"0","2","0"\r\n"0","-3","1"\r\n"load"\r\n\r\n"Synthetic switch","Notes"\r\n"On -> Off"\r\n\r\n"Diagnostic entries","Notes"\r\n"P0001"\r\n"P0001"\r\n';
test('CSV quotes, embedded commas/newlines and limits are explicit',()=>{
  assert.deepEqual(csvRows('\uFEFF"a,b","a""b"\r\n"multi\nline",x'),[['a,b','a"b'],['multi\nline','x']]);
  for(const text of ['"unclosed','"a"bad,b','a"b,c','x'.repeat(MAX_DIFFERENCE_BYTES+1),'"'+'x'.repeat(8193)+'"'])assert.throws(()=>csvRows(text));
});
test('numeric deltas never become absolute coordinates or approved edits',()=>{
  const p=parseDifferences(fixture);assert.equal(p.blocks[0].coordinates,'NOT_PRESENT');assert.equal(p.status,'READ_ONLY_NOT_RELEASED');
  const raw=summarizeDifferences(p)[0];assert.equal(raw.meaning,'RAW_EXPORT_DIFFERENCE');assert.equal(raw.changedCells,3);
  const r=summarizeDifferences(p,'BEFORE_MINUS_AFTER')[0];assert.equal(r.min,-2);assert.equal(r.max,3);
  assert.equal(p.blocks[1].kind,'TEXT_TRANSITION');assert.equal(p.blocks[2].kind,'UNINTERPRETED');assert.equal(Object.hasOwn(p.blocks[2],'disabled'),false);
});
test('reject names-only export; preserve unknown/ragged blocks without numeric inference',()=>{
  assert.throws(()=>parseDifferences('"Name","Description"\n"Table","Notes"'));
  const p=parseDifferences('"Table","Notes"\n"deg","0","0","rpm"\n"0","1"\n"load"');assert.equal(p.blocks[0].kind,'UNINTERPRETED');
  assert.throws(()=>summarizeDifferences(p,'APPROVED'));
});
test('single-column vector exports preserve changes without inventing coordinates',()=>{
  const p=parseDifferences('"Vector","Notes"\n"rpm",""\n"0","-100"\n"0","-100"\n""\n');
  assert.equal(p.blocks[0].kind,'MATRIX_DIFFERENCE');assert.equal(p.blocks[0].columnCount,1);assert.deepEqual(p.blocks[0].axisDifferences.columns,[]);
  assert.equal(summarizeDifferences(p,'BEFORE_MINUS_AFTER')[0].min,100);
});
test('report requires pair and direction evidence and retains source provenance',async()=>{
  const f={name:'synthetic.hpt',bytes:4,sha256:'a'.repeat(64)};const pair=makeCase('Synthetic','Test',f,{...f,name:'after.hpt',sha256:'b'.repeat(64)});
  await assert.rejects(differenceReport(fixture,'test.csv',null,'UNKNOWN',''));
  await assert.rejects(differenceReport(fixture,'test.csv',pair,'BEFORE_MINUS_AFTER',''));
  const r=await differenceReport(fixture,'test.csv',pair,'BEFORE_MINUS_AFTER','Verified synthetic scalar in both views');
  assert.equal(r.source.textSha256.length,64);assert.equal(r.automaticApplication,false);assert.equal(r.pairReference.final.sha256,pair.final.sha256);
  assert.equal(r.blocks.some(b=>Object.hasOwn(b,'description')),false);
});
