import {REAL_LIMIT,validateReal,makeRealDraft,numericParameter,sha256} from './realDraft.mjs';
import {importAirflowTables} from './realAirflow.mjs';
const basename=p=>typeof p==='string'?p.split(/[\\/]/).at(-1):'';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function source(s,vendor){if(!s||!s.path)throw Error('Export lacks its source tune identity.');return {vendor,name:basename(s.path),sha256:s.sha256,bytes:s.bytes??null,controllerFamily:null,operatingSystem:null,identityEvidence:null};}
function flat(values,rows,columns){if(!Array.isArray(values)||values.length!==rows||values.some(r=>!Array.isArray(r)||r.length!==columns))throw Error('Export has missing or ragged rows.');return values.flat();}
export async function importRealExport(raw,fileName,stage){
  if(new TextEncoder().encode(raw).length>REAL_LIMIT)throw Error('Export exceeds 4 MB.');
  const data=JSON.parse(raw),proof={name:basename(fileName),sha256:await sha256(new TextEncoder().encode(raw))};
  const tables=[];let selectedSource;
  const takeSource=(s,vendor='HP_TUNERS')=>{const next=source(s,vendor);if(selectedSource&&(next.sha256!==selectedSource.sha256||next.vendor!==selectedSource.vendor))throw Error('Export mixes different source tunes.');selectedSource=next;};
  const spark=(t,id,label,evidence=[proof])=>{
    if(!Number.isInteger(id)||id<1||id>1000000||!Array.isArray(t.rpm)||!Array.isArray(t.airmass))throw Error('Invalid spark table identity or axes.');
    tables.push(numericParameter(`HPT.ECM.P${id}`,label,'degrees',[t.rpm,t.airmass],[{label:'Engine speed',unit:'rpm'},{label:'Cylinder airmass',unit:'g'}],flat(t.values,t.airmass.length,t.rpm.length),evidence));
  };
  if(data.format==='DD84_SIERRA_ABSOLUTE_MAF_V1'){
    if(!['intermediate','final'].includes(stage)||!Array.isArray(data.tables)||data.tables.length!==2)throw Error('Choose intermediate or final for this complete MAF export.');
    for(const t of data.tables){const v=t[stage];if(!v||!Array.isArray(v.frequencyHz)||!Array.isArray(v.airflow)||!same(t.unit,v.airflowUnit)||!['g/s','lb/h'].includes(t.unit)||![12159,12160].includes(t.id))throw Error('Unsupported MAF units or structure.');takeSource(v.source);tables.push(numericParameter(`HPT.ECM.P${t.id}`,t.name,t.unit,[v.frequencyHz],[{label:'Frequency',unit:'Hz'}],v.airflow,[proof]));}
  }else if(data.format==='DD84_SIERRA_ORIGINAL_FINAL_MAF_V1'){
    if(!['original','final'].includes(stage)||!Array.isArray(data.tables)||data.tables.length!==2)throw Error('Choose original or final for this MAF comparison export.');
    for(const t of data.tables){if(![12159,12160].includes(t.id)||!['g/s','lb/h'].includes(t.unit)||!Array.isArray(t.points)||!t.points.length)throw Error('Unsupported MAF export.');takeSource(t[stage]?.source);tables.push(numericParameter(`HPT.ECM.P${t.id}`,t.name,t.unit,[t.points.map(p=>p.frequencyHz)],[{label:'Frequency',unit:'Hz'}],t.points.map(p=>p[stage]),[proof]));}
  }else if(data.format==='DD84_SIERRA_SPARK_STAGES_V1'){
    if(!['original','intermediate','final'].includes(stage)||!data[stage]||data.parameterId!==12600)throw Error('Choose a captured spark stage.');
    takeSource(data[stage].source);spark(data[stage],12600,'Main spark — open throttle, high octane');
  }else if(data.format==='DD84_SIERRA_ORIGINAL_SPARK_BASELINES_V1'){
    if(stage!=='original'||!Array.isArray(data.tables)||!data.tables.length)throw Error('This export contains original spark baselines only.');
    takeSource(data.source);for(const t of data.tables){if(t.units?.rpm!=='rpm'||t.units?.airmass!=='g'||t.units?.values!=='degrees')throw Error('Unrecognized exported spark units.');spark(t,t.parameterId,t.title);}
  }else if(data.format==='DD84_SIERRA_REMAINING_SPARK_STAGES_V1'){
    const ids=new Set([12601,12593,12598,12599,12701]);
    if(!['original','intermediate','final'].includes(stage)||!Array.isArray(data.tables)||data.tables.length!==ids.size)throw Error('Choose a captured stage from the complete five-table spark export.');
    takeSource(data.sources?.[stage]);
    for(const t of data.tables){
      const v=t.captures?.[stage];
      if(!ids.delete(t.parameterId)||t.units?.rpm!=='rpm'||t.units?.airmass!=='g'||t.units?.values!=='degrees')throw Error('Unrecognized or duplicate exported spark parameter or units.');
      if(!v||!Number.isInteger(t.rows)||!Number.isInteger(t.columns)||t.rows!==v.airmass?.length||t.columns!==v.rpm?.length)throw Error('Missing spark stage or inconsistent captured dimensions.');
      if(!v.evidence)throw Error('Missing spark capture evidence.');
      spark(v,t.parameterId,t.title,[proof,v.evidence]);
    }
  }else if(data.format==='DD84_SIERRA_COOLING_STAGES_V1'){
    const ids=new Set([18170,18060]);
    if(!['original','intermediate','final'].includes(stage)||!Array.isArray(data.tables)||data.tables.length!==ids.size)throw Error('Choose a captured stage from the complete cooling export.');
    takeSource(data.sources?.[stage]);
    for(const t of data.tables){
      const v=t.captures?.[stage],zones=t.parameterId===18170;
      const units=zones?{x:'zone index',y:'zone index',values:'°F'}:{x:'°F',y:'°F',values:'%'};
      if(!ids.delete(t.parameterId)||!t.units||Object.keys(t.units).length!==3||Object.keys(units).some(k=>t.units[k]!==units[k]))throw Error('Unrecognized or duplicate cooling parameter or units.');
      if(!v||!Array.isArray(v.x)||!Array.isArray(v.y)||!v.evidence||t.rows!==v.y.length||t.columns!==v.x.length)throw Error('Missing cooling stage, evidence or captured dimensions.');
      if(zones&&(!same(v.x,[0,1,2,3,4,5])||!same(v.y,[0,1,2,3])))throw Error('Desired ECT requires the captured torque/RPM zone indices.');
      tables.push(numericParameter(`HPT.ECM.P${t.parameterId}`,zones?'Desired ECT':'Fan Desired % vs. ECT vs. Desired ECT',units.values,[v.x,v.y],[{label:zones?'Torque Zone':'Engine Coolant Temp',unit:units.x},{label:zones?'RPM Zone':'Desired ECT',unit:units.y}],flat(v.values,v.y.length,v.x.length),[proof,v.evidence],'EXPORTED_VALUES',zones?'Complete displayed coolant targets. Axes identify numbered zones, not physical RPM or torque breakpoints. No native encoding or controller limits established.':'Complete displayed fan targets and temperature axes. No native encoding or controller limits established.'));
    }
  }else if(['DD84_SIERRA_VE_THREE_STAGES_V1','DD84_SIERRA_VE_OPERATING_CONTEXT_V1'].includes(data.format)){
    tables.push(...importAirflowTables(data,stage,proof,takeSource));
  }else if(data.format==='DD84_CANDIDATE_RAW_SPARK_EXTRACTION_V1'){
    if(!['base','comparison'].includes(stage)||!data.tables?.[stage])throw Error('Choose base or comparison for this Holley candidate extraction.');
    const t=data.tables[stage];takeSource(t.source,'HOLLEY');
    if(!Array.isArray(t.rpm)||!Array.isArray(t.map))throw Error('Missing Holley axes.');
    tables.push(numericParameter('Holley.Spark.Base','Candidate base spark table',null,[t.rpm,t.map],[{label:'RPM candidate',unit:null},{label:'MAP candidate',unit:null}],flat(t.valuesByAscendingMap,t.map.length,t.rpm.length),[proof],'UNVERIFIED','Partial native spot checks only. Full table encoding, value units and native round-trip remain unverified; inspection only.'));
  }else throw Error('Unsupported readable export. Native HPT/Holley files need validated decoders; use a documented complete parameter export.');
  return makeRealDraft(`${selectedSource.name} — ${stage}`.slice(0,120),selectedSource,tables);
}
export function mergeRealDrafts(current,incoming){
  current=validateReal(current);incoming=validateReal(incoming);
  if(current.source.sha256!==incoming.source.sha256||current.source.vendor!==incoming.source.vendor)throw Error('Tables belong to different source tunes. Open them as separate drafts.');
  for(const key of ['controllerFamily','operatingSystem'])if(current.source[key]&&incoming.source[key]&&current.source[key]!==incoming.source[key])throw Error('Controller/OS metadata conflicts.');
  const paths=new Set(current.parameters.map(t=>t.path));if(incoming.parameters.some(t=>paths.has(t.path)))throw Error('Duplicate parameters would overwrite work. Import into a separate draft.');
  const source={...current.source};
  if(source.bytes!==null&&incoming.source.bytes!==null&&source.bytes!==incoming.source.bytes)throw Error('Source byte counts conflict.');
  source.bytes??=incoming.source.bytes;
  const addsIdentity=['controllerFamily','operatingSystem'].some(key=>!source[key]&&incoming.source[key]);
  if(addsIdentity){
    source.controllerFamily??=incoming.source.controllerFamily;source.operatingSystem??=incoming.source.operatingSystem;
    source.identityEvidence=[source.identityEvidence,incoming.source.identityEvidence].filter(Boolean).join('\n');
  }
  return validateReal({...current,source,parameters:[...current.parameters,...incoming.parameters]});
}
export async function verifyTuneSource(file,expected){
  if(!Number.isSafeInteger(file.size)||file.size<4||file.size>64*1024*1024)throw Error('Source must be 4 bytes to 64 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length!==file.size)throw Error('Source size changed while reading.');
  const actual=await sha256(bytes);return {matches:actual===expected.sha256&&(expected.bytes===null||expected.bytes===bytes.length),sha256:actual,bytes:bytes.length};
}
