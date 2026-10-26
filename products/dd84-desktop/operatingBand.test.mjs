import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareOperatingBand,operatingBandSelection} from './operatingBand.mjs';

const selections=['RPM','MAP','MAF_MASS_FLOW'].map((role,i)=>({role,channelId:String(i+1),evidence:'Synthetic choice'}));
const csv=rows=>`HP Tuners CSV Log File\nVersion: 1.0\n[Channel Information]\n0,1,2,3\nOffset,Engine RPM,Manifold Absolute Pressure,Mass Airflow\ns,rpm,kPa,g/s\n[Channel Data]\n${rows}`;
const input=(rows,range)=>({raw:csv(rows),range,selections});
const before=()=>input('0,1000,80,10\n1,2000,100,20\n1,2000,100,\n2,3000,120,bad\n3,,100,99\n4,2000,NaN,99\n5,4000,100,40\n6,2000,100,25\n',{start:0,end:5});
const after=()=>input('10,1500,90,15\n11,2500,110,30\n12,3000,120,35\n13,5000,150,50\n',{start:10,end:12});
const band=()=>({rpm:{min:1000,max:3000,unit:'rpm'},map:{min:80,max:120,unit:'kPa'}});
const compare=(b=before(),a=after(),limits=band(),role='MAF_MASS_FLOW')=>compareOperatingBand(b,a,role,limits);

test('same-row inclusive band accounts for every window row and selected-channel reading',()=>{
  const r=compare();
  assert.deepEqual(r.before,{
    window:{start:0,end:5,unit:'s',endpoints:'BOTH_INCLUDED'},rowCount:7,invalidContextRows:2,outsideBandRows:1,includedRows:4,duplicateIncludedTimes:1,
    contextIssues:{rpmMissing:1,rpmText:0,mapMissing:0,mapText:1},
    target:{channel:{id:'3',name:'Mass Airflow',unit:'g/s'},numericCount:2,missingCount:1,textCount:1,min:10,max:20,flags:['MISSING_READINGS','NONNUMERIC_READINGS']},
    contextChannels:{rpm:{id:'1',name:'Engine RPM',unit:'rpm'},map:{id:'2',name:'Manifold Absolute Pressure',unit:'kPa'}}
  });
  assert.equal(r.after.includedRows,3);assert.equal(r.after.target.min,15);assert.equal(r.after.target.max,35);
  for(const s of [r.before,r.after]){
    assert.equal(s.rowCount,s.invalidContextRows+s.outsideBandRows+s.includedRows);
    assert.equal(s.includedRows,s.target.numericCount+s.target.missingCount+s.target.textCount);
  }
  assert.equal(r.status,'RECORDED_ROWS_IN_BOTH_BANDS');assert.equal(r.operatingConditionsMatched,false);
  assert.equal(r.learningReady,false);assert.equal(r.automaticApplication,false);
});
test('overlapping independent ranges cannot manufacture a shared RPM/pressure row',()=>{
  const b=input('0,1000,110,10\n1,2000,80,20\n',{start:0,end:1});
  const a=input('0,1000,80,10\n1,2000,110,20\n',{start:0,end:1});
  const limits={rpm:{min:900,max:1100,unit:'rpm'},map:{min:75,max:85,unit:'kPa'}};
  const r=compare(b,a,limits);assert.equal(r.before.includedRows,0);assert.equal(r.after.includedRows,1);
  assert.equal(r.before.target.min,null);assert.equal(r.status,'NO_ROWS_IN_EARLIER_BAND');
  assert.equal(compare(a,b,limits).status,'NO_ROWS_IN_LATER_BAND');
  assert.equal(compare(b,b,limits).status,'NO_ROWS_IN_EITHER_BAND');
});
test('context issue counts may overlap but each invalid row is excluded exactly once',()=>{
  const b=input('0,,,0\n1,NaN,0x20,0\n2,Infinity,100,0\n3,1e3,8e1,1e1\n',{start:0,end:3});
  const r=compare(b).before;
  assert.deepEqual(r.contextIssues,{rpmMissing:1,rpmText:2,mapMissing:1,mapText:1});
  assert.equal(r.invalidContextRows,3);assert.equal(r.includedRows,1);assert.equal(r.target.min,10);
});
test('empty, equal-time and disjoint windows do not borrow or interpolate readings',()=>{
  const empty=compare({...before(),range:{start:1.1,end:1.9}}).before;
  assert.equal(empty.rowCount,0);assert.equal(empty.target.numericCount,0);assert.equal(empty.target.min,null);
  const point=compare({...before(),range:{start:1,end:1}}).before;
  assert.equal(point.includedRows,2);assert.equal(point.duplicateIncludedTimes,1);assert.equal(point.target.missingCount,1);
  const invalid=compare({...before(),range:{start:4,end:4}}).before;
  assert.equal(invalid.invalidContextRows,1);assert.equal(invalid.includedRows,0);
});
test('missing and text target values never become zero or valid sensor readings',()=>{
  const b=input('0,1000,80,0x20\n1,1000,80,Infinity\n2,1000,80,\n3,4000,150,9\n',{start:0,end:2});
  const r=compare(b);assert.equal(r.before.includedRows,3);assert.equal(r.before.target.numericCount,0);
  assert.equal(r.before.target.missingCount,1);assert.equal(r.before.target.textCount,2);
  assert.equal(r.status,'TARGET_READINGS_MISSING');assert.equal(r.before.target.min,null);
});
test('zero, signed decimal, constant and point-band observations are preserved',()=>{
  const b=input('0,0,0,-1\n0,0,0,-1\n1,0,0,-1\n',{start:0,end:1});
  const limits={rpm:{min:0,max:0,unit:'rpm'},map:{min:0,max:0,unit:'kPa'}};
  const r=compare(b,b,limits);assert.equal(r.before.includedRows,3);assert.equal(r.before.target.min,-1);
  assert.deepEqual(r.before.target.flags,['CONSTANT_RECORDED_VALUE']);
});
test('RPM can be both context and target without counting rows twice',()=>{
  const r=compare(before(),after(),band(),'RPM');
  assert.equal(r.before.includedRows,4);assert.equal(r.before.target.numericCount,4);
  assert.equal(r.before.target.min,1000);assert.equal(r.before.target.max,3000);
});
test('actual source mappings and exact units are required on both sides',()=>{
  const a=after();a.raw=a.raw.replace('0,1,2,3','0,7,8,9');a.selections=selections.map((s,i)=>({...s,channelId:String(i+7)}));
  assert.equal(compare(before(),a).after.target.channel.id,'9');
  for(const patch of [{selections:selections.slice(1)},{selections:[...selections,selections[0]]},
    {selections:[{...selections[0],evidence:''},...selections.slice(1)]},{raw:after().raw.replace('kPa','psi')},
    {raw:after().raw.replace('Mass Airflow','Unknown flow')},{raw:after().raw.replace('g/s','lbs/min')}])
    assert.throws(()=>compare(before(),{...after(),...patch}));
  assert.throws(()=>compare(before(),after(),{...band(),map:{...band().map,unit:'psi'}}),/identical exported/);
});
test('invalid band and time bounds fail before any result is returned',()=>{
  assert.equal(operatingBandSelection(null),null);assert.equal(operatingBandSelection(undefined),null);
  for(const value of [null,{},false,{...band(),rpm:{min:3000,max:1000,unit:'rpm'}},
    {...band(),rpm:{min:NaN,max:3000,unit:'rpm'}},{...band(),map:{min:80,max:Infinity,unit:'kPa'}},
    {...band(),map:{min:'80',max:120,unit:'kPa'}},{...band(),map:{min:80,max:120,unit:'boost'}}])
    assert.throws(()=>compare(before(),after(),value));
  for(const range of [null,{start:-1,end:2},{start:0,end:7},{start:2,end:1},{start:'0',end:2},{start:0,end:Infinity}])
    assert.throws(()=>compare({...before(),range}));
  assert.throws(()=>compare({...before(),raw:'Invalid source'}));
});
test('band selection is a snapshot and 100,000 rows produce bounded reports without raw samples',()=>{
  const limits=band(),selection=operatingBandSelection(limits);limits.rpm.min=999;
  assert.equal(selection.rpm.min,1000);
  const b=input(Array.from({length:100000},(_,i)=>`${i},2000,100,10\n`).join(''),{start:0,end:99999});
  const r=compare(b,b);assert.equal(r.before.includedRows,100000);assert.equal(r.after.target.numericCount,100000);
  assert.ok(JSON.stringify(r).length<6000);assert.ok(!JSON.stringify(r).includes('"raw"'));
});
