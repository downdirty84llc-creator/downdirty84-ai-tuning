import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectMeasuredFile,summarizeMeasuredFile} from './measuredCsv.mjs';
import {normalizeMeasuredReview} from './measuredReview.mjs';
import {measuredChannelEntries,filterMeasuredChannels,channelCoverage} from './measuredChannels.mjs';
const csv=(rows,unit='kPa')=>'HP Tuners CSV Log File\nVersion: 1.0\n[Channel Information]\n0,1,2,3,4,5,6,7\nOffset,RPM,MAP,Spark,State,,Same,Same\ns,rpm,'+unit+',deg,,,g/s,g/s\n[Channel Data]\n'+rows;
const before=csv('0,1000,50,10,On,1,3,4\n1,2000,60,,Off,2,4,5\n2,3000,70,bad,On,3,5,6');
const after=csv('0,1000,7,20,Off,1,3,4\n1,2000,8,20,On,2,4,5\n2,3000,9,30,Off,3,5,6','psi');
async function side(text,name){const f=await inspectMeasuredFile(Buffer.from(text),name);return {...summarizeMeasuredFile(f,{start:0,end:2}),tune:null};}
async function fixture(){return normalizeMeasuredReview({format:'DD84_MEASURED_REVIEW_V1',learningReady:false,automaticApplication:false,writeStrategy:'SIMULATION_ONLY',before:await side(before,'a.csv'),after:await side(after,'b.csv'),outcome:{result:'unassessed',changeReason:'',changes:'',conditions:'',criterion:'',observation:'',nextAction:'',reviewer:''}});}
test('channel entries retain ambiguous, unit-mismatched, blank and text channels without inventing pairs',async()=>{
  const r=await fixture(),entries=measuredChannelEntries(r);assert.equal(entries.length,12);assert.equal(entries.filter(e=>e.paired).length,2);
  assert.equal(new Set(entries.map(e=>e.key)).size,entries.length);assert.equal(entries.filter(e=>e.name==='Same').length,4);
  assert.equal(entries.filter(e=>e.name==='MAP').length,2);assert(entries.filter(e=>e.name==='MAP').every(e=>!e.paired&&e.delta===null));
  assert.equal(entries.filter(e=>!e.name).length,2);assert.equal(entries.some(e=>e.name==='Offset'),false);
});
test('coverage uses each selected source row count and keeps missing and nonnumeric readings distinct',async()=>{
  const entries=measuredChannelEntries(await fixture()),spark=entries.find(e=>e.name==='Spark');
  assert.deepEqual({...spark.beforeCoverage,percent:null},{numeric:1,missing:1,text:1,rows:3,percent:null});assert(Math.abs(spark.beforeCoverage.percent-100/3)<1e-12);
  assert.equal(spark.afterCoverage.percent,100);assert.equal(filterMeasuredChannels(entries,{view:'incomplete'}).length,3);
  assert.equal(channelCoverage(null,0),null);assert.equal(channelCoverage({numeric:0,missing:0,text:0},0).percent,null);
});
test('channel search is literal and case-insensitive while unit selection is exact',async()=>{
  const entries=measuredChannelEntries(await fixture());
  assert.equal(filterMeasuredChannels(entries,{query:' sPaRk '}).length,1);
  assert.equal(filterMeasuredChannels(entries,{query:'kpa'}).length,1);
  assert.equal(filterMeasuredChannels(entries,{query:'MAP',unit:'psi'}).length,1);
  assert.equal(filterMeasuredChannels(entries,{unit:'PSI'}).length,0);
  assert.equal(filterMeasuredChannels(entries,{unit:''}).length,4);
  assert.equal(filterMeasuredChannels(entries,{query:'[.*]'}).length,0);
  assert.equal(filterMeasuredChannels(entries,{query:'7'}).length,2);
});
test('direction filters use the selected statistic and never treat unpaired or overflowing deltas as zero',async()=>{
  const r=await fixture();r.before.channels[3]={...r.before.channels[3],numeric:3,missing:0,text:0,min:10,max:30,mean:20,median:20,p95:30};r.after.channels[3]={...r.after.channels[3],min:0,max:40,mean:20,median:20,p95:40};
  const entries=measuredChannelEntries(r);
  assert.equal(filterMeasuredChannels(entries,{view:'changed',statistic:'mean'}).length,0);
  assert.equal(filterMeasuredChannels(entries,{view:'increased',statistic:'max'}).length,1);
  assert.equal(filterMeasuredChannels(entries,{view:'decreased',statistic:'min'}).length,1);
  for(const key of ['min','max','mean','median','p95']){r.before.channels[1][key]=-1e308;r.after.channels[1][key]=1e308;}
  const overflow=measuredChannelEntries(r).find(e=>e.name==='RPM');assert.equal(overflow.delta.mean,null);assert.equal(filterMeasuredChannels([overflow],{view:'changed'}).length,0);assert.equal(filterMeasuredChannels([overflow],{view:'paired'}).length,1);
});
test('single-sided and no-data reviews remain available as unpaired evidence',async()=>{
  const r=await fixture();r.after=null;
  for(const c of r.before.channels){c.numeric=c.missing=c.text=0;for(const key of ['min','max','mean','median','p95'])c[key]=null;}
  r.before.rows=r.before.windowRows=r.before.invalidFilterRows=r.before.outsideFilterRows=r.before.duplicateTimes=0;
  const entries=measuredChannelEntries(r);assert.equal(entries.length,7);assert.equal(filterMeasuredChannels(entries,{view:'unpaired'}).length,7);assert.equal(filterMeasuredChannels(entries,{view:'incomplete'}).length,7);assert.equal(filterMeasuredChannels(entries,{view:'changed'}).length,0);
});
test('exploring canonicalizes imported deltas and never mutates or promotes saved evidence',async()=>{
  const r=await fixture(),copy=structuredClone(r);r.comparisons[0].delta.mean=999;r.status='APPROVED';
  const snapshot=structuredClone(r),entries=measuredChannelEntries(r);assert.equal(entries.find(e=>e.name==='RPM').delta.mean,0);
  filterMeasuredChannels(entries,{query:'spark',view:'increased'});assert.deepEqual(r,snapshot);
  entries[0].before.mean=123;assert.deepEqual(r,snapshot);assert.equal(copy.learningReady,false);
  assert.throws(()=>measuredChannelEntries({...r,automaticApplication:true}));
});
test('invalid filter values fail explicitly',async()=>{
  const entries=measuredChannelEntries(await fixture());
  for(const options of [{query:1},{query:'x'.repeat(241)},{unit:1},{view:'__proto__'},{statistic:'toString'}])assert.throws(()=>filterMeasuredChannels(entries,options),/Invalid channel view/);
});
