import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectMeasuredFile,summarizeMeasuredFile,decodeMeasuredCsv,scanMeasuredCsv} from './measuredCsv.mjs';
import {normalizeMeasuredReview,parseMeasuredReview,MAX_MEASURED_REPORT_BYTES} from './measuredReview.mjs';
import {blankCase,caseReport,parseCase} from './troubleshooting.mjs';
import {validateRequest} from './saveFile.cjs';
const bytes=s=>new TextEncoder().encode(s);
const csv=rows=>'HP Tuners CSV Log File\nVersion: 1.0\n[Channel Information]\n0,1,2,3,4\nOffset,RPM,MAP,Spark,Status\ns,rpm,kPa,deg,\n[Channel Data]\n'+rows;
const holley=rows=>'Point Number,RTC,RPM,MAP,Ignition Timing,\n,[sec],[RPM],[kPa],[°],\n'+rows;
const outcome={result:'unassessed',changeReason:'',changes:'',conditions:'',criterion:'',observation:'',nextAction:'',reviewer:''};
const base=(before,after)=>({format:'DD84_MEASURED_REVIEW_V1',writeStrategy:'SIMULATION_ONLY',learningReady:false,automaticApplication:false,before,after,outcome});
async function side(text,name='fixture.csv',selection=null){const f=await inspectMeasuredFile(bytes(text),name);return {...summarizeMeasuredFile(f,selection??{start:f.inspection.start,end:f.inspection.end}),tune:null};}
test('all-channel summaries retain missing/text counts and exact row-weighted statistics',async()=>{
  const s=await side(csv('0,1000,50,0,On\n1,2000,60,10,Off\n1,3000,70,,Off\n2,4000,80,20,On\n3,5000,90,bad,On'));
  const c=s.channels[3];assert.deepEqual([c.numeric,c.missing,c.text,c.min,c.max,c.mean,c.median,c.p95],[3,1,1,0,20,10,10,20]);assert.equal(s.duplicateTimes,1);assert.equal(s.channels[4].text,5);
});
test('Holley CSV preserves blank headers, units and Windows-1252 degree symbols',async()=>{
  const raw=Buffer.from(holley('1,0,900,60,25,0\n2,1,1000,65,26,0'),'latin1');const f=await inspectMeasuredFile(raw,'holley.csv');assert.equal(f.source.encoding,'WINDOWS-1252');assert.equal(f.inspection.channels[4].unit,'°');assert.equal(f.inspection.channels[5].name,'');assert.equal(f.inspection.start,0);
  assert.throws(()=>decodeMeasuredCsv(Uint8Array.from([0xff,0xff])),/encoding/);
});
test('inclusive windows and multiple filters exclude absent context without filling data',async()=>{
  const s=await side(csv('0,1000,50,10,On\n1,2000,60,20,On\n2,,60,30,On\n3,2500,90,40,On\n4,3000,60,50,On'),undefined,{start:1,end:3,filters:[{channelId:'1',min:2000,max:2500},{channelId:'2',min:50,max:70}]});
  assert.deepEqual([s.windowRows,s.rows,s.invalidFilterRows,s.outsideFilterRows],[3,1,1,1]);assert.equal(s.channels[3].mean,20);
  const empty=await side(csv('0,1,1,1,x\n2,2,2,2,x'),undefined,{start:1,end:1});assert.equal(empty.rows,0);assert.equal(empty.channels[3].mean,null);
});
test('descriptive deltas are later minus earlier, and outcome cannot be inferred from them',async()=>{
  const a=await side(csv('0,1000,50,10,On\n1,1000,50,20,On'));
  const b=await side(csv('0,1000,50,12,On\n1,1000,50,16,On'));
  const r=normalizeMeasuredReview(base(a,b));assert.equal(r.comparisons.find(c=>c.name==='Spark').delta.mean,-1);assert.equal(r.outcome.result,'unassessed');assert.equal(r.learningReady,false);assert(r.unmatched.some(c=>c.name==='Status'));assert(r.missing.includes('Operator outcome review'));
});
test('units, ambiguous labels, no numeric readings and same-file pairs stay explicit',async()=>{
  const a=await side(csv('0,1000,50,10,On'));
  const b=await side(csv('0,1000,50,,Off').replace('s,rpm,kPa,deg,','s,rpm,psi,deg,'));
  const r=normalizeMeasuredReview(base(a,b));assert.equal(r.comparisons.length,1);assert(r.unmatched.some(c=>c.name==='MAP'));assert(r.unmatched.some(c=>c.name==='Spark'));
  const dup=structuredClone(a);dup.channels[3].name='MAP';dup.channels[3].unit='kPa';assert(!normalizeMeasuredReview(base(dup,a)).comparisons.some(c=>c.name==='MAP'));
  assert(normalizeMeasuredReview(base(a,a)).missing.some(s=>s.includes('same CSV')));
});
test('import recalculates deltas and readiness and rejects forged gates, counts and associations',async()=>{
  const a=await side(csv('0,1,2,3,x\n1,2,3,4,x'));
  const r=base(a,null);r.comparisons=[{delta:{mean:999}}];r.status='APPROVED';assert.deepEqual(normalizeMeasuredReview(r).comparisons,[]);
  for(const change of [v=>v.learningReady=true,v=>v.before.rows=999,v=>v.before.channels[1].mean=Infinity,v=>v.before.channels[1].min=99,v=>v.before.channels[2].id='1',v=>v.before.source.name='C:\\private.csv',v=>v.before.selection.filters=[{id:'1',name:'Wrong',unit:'rpm',min:0,max:1}]]){const v=structuredClone(r);change(v);assert.throws(()=>normalizeMeasuredReview(v));}
});
test('V2 case round trip retains all measurements and reported worse outcome without releasing',async()=>{
  const s=blankCase();s.format='DD84_TROUBLESHOOTING_CASE_V2';s.measuredReview=base(await side(csv('0,1,2,3,x')),null);s.measuredReview.outcome={...outcome,result:'worse',observation:'Synthetic concern'};
  const saved=caseReport(s),restored=caseReport(parseCase(JSON.stringify(saved)));assert.deepEqual(restored,saved);assert.equal(restored.assessment.status,'CONCERNS_RECORDED');assert.equal(restored.measuredReview.automaticApplication,false);validateRequest({filename:'measured-case.json',text:JSON.stringify(saved)});
  assert.throws(()=>parseCase(JSON.stringify({...s,format:'DD84_TROUBLESHOOTING_CASE_V1'})));
});
test('malformed exports, backward time and impossible filter choices are rejected',async()=>{
  for(const text of [csv('1,1,2,3,x\n0,1,2,3,x'),csv('0,1,2'),csv('0,1,2,3,"unterminated'),holley('1,no,1,2,3,4'),holley('1,0,1,2,3,4').replace('[sec]','[ms]'),'native binary'])assert.throws(()=>scanMeasuredCsv(text));
  const f=await inspectMeasuredFile(bytes(csv('0,1,2,3,x')),'a.csv');assert.throws(()=>summarizeMeasuredFile(f,{start:0,end:2}));assert.throws(()=>summarizeMeasuredFile(f,{start:0,end:0,filters:[{channelId:'bad',min:0,max:1}]}));
});

test('oversized imported and generated measured reports fail before saving',async()=>{
  assert.throws(()=>parseMeasuredReview(' '.repeat(MAX_MEASURED_REPORT_BYTES+1)),/768 KiB/);
  const s=await side(csv('0,1,2,3,x'));
  s.channels=Array.from({length:512},(_,i)=>({...s.channels[1],id:String(i),name:String(i).padEnd(240,'x'),unit:'u'.repeat(64)}));
  const later=structuredClone(s);later.channels.forEach(c=>c.name=c.name.replace(/x/g,'y'));
  assert.throws(()=>normalizeMeasuredReview(base(s,later)),/768 KiB/);
});
