// Read-only adapter for user-exported comparison CSV, not proprietary HPT data.
import {parseCase} from './filePair.mjs';
export const MAX_DIFFERENCE_BYTES=2*1024*1024;
const numeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const number=value=>numeric.test(value.trim())&&Number.isFinite(Number(value));
export function csvRows(raw){
  if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_DIFFERENCE_BYTES)throw Error('Comparison export must be at most 2 MB.');
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  const pushCell=()=>{if(cell.length>8192||row.length>=512)throw Error('CSV field or row exceeds the import limit.');row.push(cell);cell='';closed=false;};
  const pushRow=()=>{pushCell();rows.push(row);row=[];if(rows.length>20000)throw Error('CSV has too many rows.');};
  raw=raw.replace(/^\uFEFF/,'');
  for(let i=0;i<raw.length;i++){
    const ch=raw[i];
    if(quoted){if(ch==='"'){if(raw[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;}
    else if(ch===',')pushCell();
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&raw[i+1]==='\n')i++;pushRow();}
    else if(ch==='"'&&!cell&&!closed)quoted=true;
    else {if(closed||ch==='"')throw Error('Malformed CSV quoting.');cell+=ch;}
    if(cell.length>8192)throw Error('CSV field exceeds the import limit.');
  }
  if(quoted)throw Error('Unclosed CSV field.');
  if(cell||row.length||closed)pushRow();
  return rows;
}
export function parseDifferences(raw){
  const groups=[];let group=[];
  for(const row of csvRows(raw)){if(row.every(c=>!c.trim())){if(group.length)groups.push(group);group=[];}else group.push(row);}
  if(group.length)groups.push(group);
  if(!groups.length||groups.length>512)throw Error('No comparison blocks found, or too many blocks.');
  if(groups[0][0][0]==='Name'&&groups[0][0][1]==='Description')throw Error('This is a names-only export. Select the detailed Differences CSV.');
  const blocks=groups.map((rows,index)=>{
    const header=rows[0];
    if(header.length!==2||!header[0].trim()||header[0].length>255)throw Error(`Unrecognized comparison block ${index+1}. Import the detailed Differences CSV.`);
    const base={name:header[0],kind:'UNINTERPRETED',rows:rows.slice(1)};
    // Description prose is deliberately not copied into the native record.
    const data=rows.slice(1);
    if(data.length===1&&data[0].length===1){
      const scalar=data[0][0].match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s+([^\d\s].{0,15})$/);
      if(scalar&&number(scalar[1]))return {...base,kind:'SCALAR_DIFFERENCE',unit:scalar[2],values:[Number(scalar[1])]};
      if(data[0][0].includes(' -> '))return {...base,kind:'TEXT_TRANSITION',transition:data[0][0]};
    }
    // Axis entries in a differences export are differences too, never coordinates.
    if(data.length>=3){
      const top=data[0],bottom=data.at(-1);
      const vector=top.length===2&&top[1]==='';
      const body=vector?data.slice(1):data.slice(1,-1);
      const width=vector?1:top.length-2;
      if(width>0&&top[0]&&(vector||bottom.length===1)&&top.slice(1,-1).every(number)&&body.length&&body.every(r=>r.length===width+1&&r.every(number))){
        return {...base,kind:'MATRIX_DIFFERENCE',unit:top[0],rowCount:body.length,columnCount:width,values:body.flatMap(r=>r.slice(1).map(Number)),axisDifferences:{columns:vector?[]:top.slice(1,-1).map(Number),rows:body.map(r=>Number(r[0]))},coordinates:'NOT_PRESENT'};
      }
    }
    return base;
  });
  if(blocks.every(b=>b.rows.length===0))throw Error('This is a names-only export. Select the detailed Differences CSV.');
  return {format:'DD84_DIFFERENCES_V1',status:'READ_ONLY_NOT_RELEASED',writeStrategy:'SIMULATION_ONLY',blocks};
}
export function summarizeDifferences(parsed,direction='UNKNOWN'){
  if(!['UNKNOWN','BEFORE_MINUS_AFTER','AFTER_MINUS_BEFORE'].includes(direction))throw Error('Unknown difference direction.');
  return parsed.blocks.map(block=>{
    if(!block.values)return {name:block.name,kind:block.kind,detail:block.transition??'Preserved without interpretation; behavior fields or numeric shape are not established.'};
    const factor=direction==='BEFORE_MINUS_AFTER'?-1:1;
    const values=block.values.map(n=>n*factor);
    return {name:block.name,kind:block.kind,unit:block.unit,cells:values.length,changedCells:values.filter(v=>v!==0).length,min:values.reduce((a,v)=>Math.min(a,v),Infinity),max:values.reduce((a,v)=>Math.max(a,v),-Infinity),meaning:direction==='UNKNOWN'?'RAW_EXPORT_DIFFERENCE':'AFTER_MINUS_BEFORE',coordinates:'NOT_PRESENT'};
  });
}
export async function differenceReport(raw,filename,pair,direction,evidence){
  if(typeof filename!=='string'||filename.length>255||/[\\/]/.test(filename)||!filename.toLowerCase().endsWith('.csv'))throw Error('Expected a CSV basename.');
  if(!pair||pair.format!=='DD84_FILE_PAIR_V1')throw Error('Open a file-pair reference before exporting the report.');
  pair=parseCase(JSON.stringify(pair));
  if(typeof evidence!=='string'||evidence.length>2000||(direction!=='UNKNOWN'&&!evidence.trim()))throw Error('Explain how the difference direction was verified.');
  const parsed=parseDifferences(raw);const summary=summarizeDifferences(parsed,direction);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  return {...parsed,source:{name:filename,textSha256:[...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join(''),hashScope:'UTF8_DECODED_TEXT'},pairReference:pair,association:'OPERATOR_SUPPLIED_NOT_EMBEDDED_IN_CSV',direction,directionEvidence:evidence.trim(),summary,automaticApplication:false,limitations:['Difference export has no verified absolute values or operating coordinates.','Text transitions retain vendor notation; diagnostic entries do not establish enabled/disabled behavior.','This report is not learning data approval, a controller adapter, or a flash package.']};
}
