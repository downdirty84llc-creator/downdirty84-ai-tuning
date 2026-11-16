import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sample,edit} from './project.mjs';
import {makeRecoveryRecord,recoveryRecord,recoverySnapshot,openRecoveryStore} from './projectRecovery.mjs';
test('recovery preserves edited and original project values plus the review note',()=>{
  const project=edit(sample(),'Idle.TargetSpeed',0,850),snapshot={project,note:'Synthetic review note'};
  const record=makeRecoveryRecord(true,snapshot);assert.deepEqual(recoveryRecord(record),record);assert.deepEqual(record.snapshot,snapshot);snapshot.project.parameters[0].values[0]=99;assert.notEqual(record.snapshot.project.parameters[0].values[0],99);
});
test('recovery is separate from a saved project and retains simulation-only boundaries',()=>{
  const snapshot=recoverySnapshot({project:sample(),note:''});assert.equal(snapshot.project.writeStrategy,'SIMULATION_ONLY');assert.throws(()=>recoverySnapshot({project:{...sample(),writeStrategy:'LIVE'},note:''}),/Unsupported/);assert.throws(()=>recoverySnapshot({...snapshot,verified:true}),/Unsupported/);
});
test('disabled recovery cannot retain data and malformed generations fail without repair',()=>{
  const r=makeRecoveryRecord(false,null);assert.equal(r.snapshot,null);
  for(const value of [{...r,format:'future'},{...r,token:1},{...r,updatedAt:'not a date'},{...r,snapshot:{project:sample(),note:''}},{...r,extra:'unknown'}])assert.throws(()=>recoveryRecord(value),/unsupported|unreadable/);
});
test('recovery accepts empty notes but rejects invalid lengths and data types',()=>{
  for(const note of [1,null,'x'.repeat(2001)])assert.throws(()=>recoverySnapshot({project:sample(),note}),/Unsupported/);assert.equal(makeRecoveryRecord(true,{project:sample(),note:''}).snapshot.note,'');
});
test('storage absence is an explicit error, never a successful recovery claim',async()=>{
  await assert.rejects(openRecoveryStore(null).read(),/unavailable/);
});
