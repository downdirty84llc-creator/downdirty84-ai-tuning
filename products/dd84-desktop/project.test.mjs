import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sample as legacySample,edit as legacyEdit} from './model.mjs';
import {definition} from './parameters.mjs';
import {sample,parse,validate,edit,restore,backup,changes,coordinates,review,LIMIT} from './project.mjs';
const maf='Airflow.MAF.Curve',ve='Airflow.VE.Map',spark='Spark.Advance.Map',idle='Idle.TargetSpeed',choice='Demo.TableSelection',toggle='Demo.Switch';
const parameter=(p,path)=>p.parameters.find(item=>item.path===path);
test('all supported parameter shapes edit, preserve originals and save/reopen exactly',()=>{
  const original=sample();let p=original;
  for(const [path,index,value] of [[maf,2,52.123456789],[ve,5,66.25],[spark,8,-5],[idle,0,900],[choice,0,'ALTERNATE'],[toggle,0,true]])p=edit(p,path,index,value);
  assert.equal(changes(p).length,6);
  assert.deepEqual(parse(JSON.stringify(p,null,2)),p);
  assert.deepEqual(p.parameters.map(p=>p.original),original.parameters.map(p=>p.values));
  assert.deepEqual(backup(p),original);
  assert.deepEqual(restore(p),original);
  assert.equal(parameter(original,maf).values[2],50);
  const restored=restore(p,ve);assert.equal(changes(restored).length,5);assert.equal(parameter(restored,maf).values[2],52.123456789);
});
test('map indexing uses X columns and Y rows with signed and zero differences',()=>{
  const p=edit(edit(sample(),spark,8,-5),ve,5,66.25),items=changes(p);
  assert.deepEqual(coordinates(parameter(p,ve),5),{x:2000,y:60});
  assert.deepEqual(items[0],{path:ve,index:5,kind:'map',coordinates:{x:2000,y:60},before:60,after:66.25,unit:'%',definitionKnown:true,delta:6.25,multiplier:66.25/60});
  assert.equal(items[1].delta,-5);assert.equal('multiplier' in items[1],false);
  assert.deepEqual(coordinates(parameter(p,idle),0),{});
});
test('legacy V1 migration preserves axes, originals and edits without claiming extra tables',()=>{
  const old=legacyEdit(legacySample(),2,52),p=parse(JSON.stringify(old));
  assert.equal(p.format,'DD84_STUDIO_V2');assert.equal(p.parameters.length,1);
  assert.deepEqual(p.parameters[0],{path:maf,axes:[old.axis],original:old.original,values:old.values});
  assert.deepEqual(parse(JSON.stringify(p)),p);assert.equal(changes(p)[0].after,52);
});
test('unknown definitions remain read-only and round-trip without invented units',async()=>{
  const p=sample(),unknown={path:'Future.Unknown',axes:[[10,20]],original:[0,'unknown'],values:[1,'unknown']};p.parameters.push(unknown);
  const loaded=parse(JSON.stringify(p));assert.deepEqual(loaded.parameters.at(-1),unknown);
  assert.throws(()=>edit(loaded,unknown.path,0,2),/no editable definition/);
  assert.throws(()=>restore(loaded,unknown.path),/no editable definition/);
  assert.deepEqual(restore(loaded).parameters.at(-1),unknown);
  const item=changes(loaded)[0];assert.equal(item.definitionKnown,false);assert.equal(item.unit,null);assert.equal('multiplier' in item,false);
  const draft=await review(loaded,'Unknown imported difference retained for inspection');assert.equal(draft.items[0].definitionKnown,false);
  assert.deepEqual(backup(loaded).parameters.at(-1).values,unknown.original);
});
test('definition bounds, types, enum choices and fixed axes are enforced for original and working values',()=>{
  for(const [path,value] of [[maf,0],[maf,5001],[maf,NaN],[maf,Infinity],[maf,'50'],[ve,-1],[ve,301],[spark,-61],[spark,61],[idle,800.5],[choice,'FLASH'],[choice,true],[toggle,1],[toggle,'false']])assert.throws(()=>edit(sample(),path,0,value));
  for(const path of [maf,ve,spark,idle]){const p=sample();parameter(p,path).original[0]=NaN;assert.throws(()=>validate(p));}
  for(const axes of [[[2,1]],[[1,1]],[[1]],[[1,Infinity]],[[1,30001]],[[1,,3]],[]]){const p=sample();parameter(p,maf).axes=axes;assert.throws(()=>validate(p));}
  assert.throws(()=>edit(sample(),maf,-1,1));assert.throws(()=>edit(sample(),maf,0.5,1));assert.throws(()=>edit(sample(),maf,100,1));
});
test('reject dimension mismatches, duplicates, file-supplied definitions and release overrides',()=>{
  for(const patch of [{controller:'REAL'},{writeStrategy:'FLASH'},{definitionSet:'UNTRUSTED'},{format:'HPT'},{name:''},{name:'x'.repeat(121)},{definitions:{}},{parameters:[]},{parameters:null}])assert.throws(()=>validate({...sample(),...patch}));
  for(const action of [p=>p.parameters.push(p.parameters[0]),p=>parameter(p,ve).values.pop(),p=>parameter(p,ve).axes.reverse(),p=>parameter(p,maf).unit='volts',p=>parameter(p,maf).editable=true,p=>parameter(p,maf).original[0]={value:10}]){const p=sample();action(p);assert.throws(()=>validate(p));}
  assert.throws(()=>parse('not JSON'));assert.throws(()=>parse(' '.repeat(LIMIT+1)));
  assert.throws(()=>{definition(maf).max=1e9;},TypeError);
});
test('project and per-table dimensions are bounded, including unknown parameters',()=>{
  const p=sample();p.parameters=[{path:'Unknown.Large',axes:[Array.from({length:65},(_,i)=>i),Array.from({length:65},(_,i)=>i)],original:Array(4225).fill(1),values:Array(4225).fill(1)}];assert.throws(()=>validate(p));
  p.parameters=Array.from({length:129},(_,i)=>({path:`Unknown.P${i}`,axes:[],original:[0],values:[0]}));assert.throws(()=>validate(p));
  p.parameters=Array.from({length:9},(_,i)=>({path:`Unknown.P${i}`,axes:[Array.from({length:64},(_,j)=>j),Array.from({length:64},(_,j)=>j)],original:Array(4096).fill(1),values:Array(4096).fill(1)}));assert.throws(()=>validate(p),/32,768/);
  p.parameters=p.parameters.slice(0,2).map(item=>({...item,original:Array(4096).fill('x'.repeat(120)),values:Array(4096).fill('x'.repeat(120))}));assert.throws(()=>validate(p),/1 MB/);
});
test('review fingerprints all original parameters, identity and axes; edits and ordering do not change baseline',async()=>{
  const edited=edit(sample(),maf,0,11),first=await review(edited,'MAF example');
  assert.equal(first.status,'LOCAL_DRAFT_NOT_RELEASED');assert.equal(first.writeStrategy,'SIMULATION_ONLY');assert.match(first.originalSha256,/^[a-f0-9]{64}$/);
  const another=edit(edited,ve,1,46);another.name='Renamed project';another.parameters.reverse();
  assert.equal((await review(another,'More edits')).originalSha256,first.originalSha256);
  const baselineChanged=validate(edited);parameter(baselineChanged,idle).original[0]=801;
  assert.notEqual((await review(baselineChanged,'Different original')).originalSha256,first.originalSha256);
  const axisChanged=validate(edited);parameter(axisChanged,maf).axes[0][0]=2001;
  assert.notEqual((await review(axisChanged,'Different axis')).originalSha256,first.originalSha256);
});
test('async review snapshots project and requires changes plus a nonempty note',async()=>{
  const p=edit(sample(),toggle,0,true),pending=review(p,'Original note');
  p.name='Changed after start';parameter(p,toggle).values[0]=false;
  const draft=await pending;assert.equal(draft.name,'My multi-parameter simulation');assert.equal(draft.items[0].after,true);
  assert.equal('multiplier' in draft.items[0],false);
  await assert.rejects(review(sample(),'Note'));await assert.rejects(review(edit(sample(),idle,0,850),' '));await assert.rejects(review(edit(sample(),idle,0,850),'x'.repeat(2001)));
});
