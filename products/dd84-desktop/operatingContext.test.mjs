import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareOperatingContext} from './operatingContext.mjs';

const selections=['RPM','MAP','INTAKE_TEMPERATURE','COOLANT_TEMPERATURE'].map((role,i)=>({role,channelId:String(i+1),evidence:'Synthetic selection'}));
const csv=(rows,units='s,rpm,kPa,°C,°C',ids='0,1,2,3,4')=>
  `HP Tuners CSV Log File\nVersion: 1.0\n[Channel Information]\n${ids}\nOffset,Engine RPM,Manifold Absolute Pressure,Intake Air Temp,Engine Coolant Temp\n${units}\n[Channel Data]\n${rows}`;
const before=()=>({raw:csv('0,1000,80,20,80\n1,2000,100,21,81\n1,,bad,,82\n2,3000,120,22,\n4,6000,200,40,100\n'),selections,range:{start:0,end:2}});
const after=()=>({raw:csv('10,1500,90,22,82\n11,2500,110,23,83\n12,,NaN,24,84\n14,7000,210,50,110\n'),selections,range:{start:10,end:12}});

test('context compares reviewed roles in independent inclusive windows with exact counts',()=>{
  const r=compareOperatingContext(before(),after());
  assert.deepEqual(r.windows,{before:{start:0,end:2,unit:'s',endpoints:'BOTH_INCLUDED',rowCount:4,duplicateTimes:1},
    after:{start:10,end:12,unit:'s',endpoints:'BOTH_INCLUDED',rowCount:3,duplicateTimes:0}});
  assert.deepEqual(r.channels.map(c=>({role:c.role,status:c.status,range:c.sharedRange,counts:c.readingsInSharedRange})),[
    {role:'RPM',status:'RANGE_OVERLAP',range:{min:1500,max:2500,unit:'rpm',endpoints:'BOTH_INCLUDED'},counts:{before:1,after:2}},
    {role:'MAP',status:'RANGE_OVERLAP',range:{min:90,max:110,unit:'kPa',endpoints:'BOTH_INCLUDED'},counts:{before:1,after:2}},
    {role:'INTAKE_TEMPERATURE',status:'SINGLE_VALUE_OVERLAP',range:{min:22,max:22,unit:'°C',endpoints:'BOTH_INCLUDED'},counts:{before:1,after:1}},
    {role:'COOLANT_TEMPERATURE',status:'SINGLE_VALUE_OVERLAP',range:{min:82,max:82,unit:'°C',endpoints:'BOTH_INCLUDED'},counts:{before:1,after:1}}
  ]);
  assert.deepEqual(r.channels[1].before,{status:'SELECTED',channel:{id:'2',name:'Manifold Absolute Pressure',unit:'kPa'},numericCount:3,missingCount:0,textCount:1,min:80,max:120,flags:['NONNUMERIC_READINGS']});
  assert.equal(r.channels[0].before.missingCount,1);assert.equal(r.channels[2].before.missingCount,1);
  assert.equal(r.operatingConditionsMatched,false);assert.equal(r.learningReady,false);assert.equal(r.automaticApplication,false);
});
test('range bounds alone cannot hide a gap with no readings inside the shared interval',()=>{
  const b=before();b.raw=csv('0,1000,80,20,80\n2,3000,120,22,82\n');
  const r=compareOperatingContext(b,after()).channels[0];
  assert.equal(r.status,'OVERLAP_WITHOUT_READINGS_ON_BOTH_SIDES');assert.deepEqual(r.readingsInSharedRange,{before:0,after:2});
});
test('disjoint ranges do not receive an invented shared interval or coverage count',()=>{
  const a=after();a.raw=a.raw.replace('1500','3500').replace('2500','4500');
  const r=compareOperatingContext(before(),a).channels[0];
  assert.equal(r.status,'NO_RANGE_OVERLAP');assert.equal(r.sharedRange,null);
  assert.deepEqual(r.readingsInSharedRange,{before:null,after:null});
});
test('unreviewed candidates stay unselected and preserve the other side without choosing channels',()=>{
  const a=after();a.selections=[selections[0]];
  const r=compareOperatingContext(before(),a);
  for(const c of r.channels.slice(1)){
    assert.equal(c.status,'MISSING_REVIEWED_CHANNEL');assert.equal(c.after.status,'UNSELECTED');
    assert.equal(c.after.numericCount,null);assert.equal(c.after.channel,null);assert.equal(c.before.status,'SELECTED');
  }
  const empty=compareOperatingContext({...before(),selections:[]},{...after(),selections:[]});
  assert.ok(empty.channels.every(c=>c.status==='MISSING_REVIEWED_CHANNEL'));
});
test('pressure and temperature unit mismatches remain separate with no conversion',()=>{
  const a=after();a.raw=a.raw.replace('s,rpm,kPa,°C,°C','s,rpm,psi,°F,°F');
  const r=compareOperatingContext(before(),a);
  for(const c of r.channels.slice(1)){
    assert.equal(c.status,'UNIT_MISMATCH');assert.equal(c.sharedRange,null);assert.equal(c.readingsInSharedRange.before,null);
  }
  assert.equal(r.channels[0].status,'RANGE_OVERLAP');
});
test('empty and missing-only windows never borrow data outside their bounds',()=>{
  const b=before(),a=after();b.range={start:0.5,end:0.5};a.range={start:12,end:12};
  const r=compareOperatingContext(b,a),rpm=r.channels[0];
  assert.equal(r.windows.before.rowCount,0);assert.equal(r.windows.after.rowCount,1);
  assert.equal(rpm.before.numericCount,0);assert.equal(rpm.before.min,null);
  assert.equal(rpm.after.numericCount,0);assert.equal(rpm.after.missingCount,1);assert.equal(rpm.status,'NO_NUMERIC_READINGS');
});
test('finite decimal readings preserve zeros, signs, duplicate times and constant-value flags',()=>{
  const raw=csv('0,0,0,-1,0\n0,0,0,-1,0\n1,0,0,-1,0\n');
  const r=compareOperatingContext({raw,selections,range:{start:0,end:1}},{raw,selections,range:{start:0,end:1}});
  assert.equal(r.windows.before.duplicateTimes,1);
  for(const c of r.channels){assert.equal(c.status,'SINGLE_VALUE_OVERLAP');assert.deepEqual(c.readingsInSharedRange,{before:3,after:3});assert.deepEqual(c.before.flags,['CONSTANT_RECORDED_VALUE']);}
  assert.equal(r.channels[0].before.min,0);assert.equal(r.channels[2].before.min,-1);
});
test('text, hex notation and nonfinite values are excluded instead of being coerced or filled',()=>{
  const b=before();b.raw=csv('0,1e3,80,20,80\n1,0x10,90,21,81\n1,Infinity,100,22,82\n2,NaN,110,23,83\n');
  const r=compareOperatingContext(b,after()).channels[0];
  assert.equal(r.before.numericCount,1);assert.equal(r.before.textCount,3);assert.equal(r.before.min,1000);
  assert.deepEqual(r.before.flags,['NONNUMERIC_READINGS','CONSTANT_RECORDED_VALUE']);
});
test('identical independent ranges do not imply combined RPM/load coverage or matched conditions',()=>{
  const b={raw:csv('0,1000,110,20,80\n1,2000,80,21,81\n'),selections,range:{start:0,end:1}};
  const a={...b,raw:csv('0,1000,80,21,81\n1,2000,110,20,80\n')};
  const r=compareOperatingContext(b,a);
  assert.ok(r.channels.every(c=>c.status==='RANGE_OVERLAP'));
  assert.equal(r.status,'OPERATING_CONDITIONS_NOT_MATCHED');assert.equal(r.operatingConditionsMatched,false);
  assert.ok(r.limitations.some(s=>s.includes('simultaneous RPM/load/temperature')));
});
test('invalid bounds, unsupported mappings and malformed sources fail without a partial review',()=>{
  for(const range of [null,{start:NaN,end:2},{start:0,end:Infinity},{start:'0',end:2},{start:2,end:1},{start:-1,end:2},{start:0,end:5}])
    assert.throws(()=>compareOperatingContext({...before(),range},after()));
  for(const patch of [{raw:'bad CSV'},{selections:[{...selections[0],channelId:'unknown'}]},
    {selections:[{...selections[0],evidence:''}]},{selections:[selections[0],selections[0]]}])
    assert.throws(()=>compareOperatingContext({...before(),...patch},after()));
});
test('channel IDs and names are resolved from each source independently',()=>{
  const a=after();a.raw=a.raw.replace('0,1,2,3,4','0, 8 ,9,10,11');
  a.selections=selections.map((s,i)=>({...s,channelId:[' 8 ','9','10','11'][i]}));
  const r=compareOperatingContext(before(),a);
  assert.equal(r.channels[0].after.channel.id,' 8 ');assert.equal(r.channels[0].readingsInSharedRange.after,2);
});
test('100,000-row inputs produce bounded summaries and never serialize samples',()=>{
  const raw=csv(Array.from({length:100000},(_,i)=>`${i},1000,100,20,80\n`).join(''));
  const input={raw,selections,range:{start:0,end:99999}},r=compareOperatingContext(input,input);
  assert.equal(r.windows.before.rowCount,100000);
  assert.ok(r.channels.every(c=>c.readingsInSharedRange.before===100000));
  assert.ok(JSON.stringify(r).length<10000);assert.ok(!JSON.stringify(r).includes('"values"'));
});
