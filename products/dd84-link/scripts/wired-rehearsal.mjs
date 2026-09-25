import {createReadStream,mkdtempSync,mkdirSync,openSync,writeSync,closeSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {buildFixture} from './build-wire-fixture.mjs';
import {WireParser} from '../shared/wire.mjs';

const output=process.argv[2]?resolve(process.argv[2]):mkdtempSync(join(tmpdir(),'dd84-rehearsal-'));
mkdirSync(output,{recursive:true});
const fixture=buildFixture();
let fd;
try {
  fd=openSync(join(output,'synthetic-capture.jsonl'),'wx');
  const parser=new WireParser('72623859790382856');
  let frames=0,status=null,errors=0;
  for await(const chunk of createReadStream(fixture.path,{highWaterMark:317})) {
    for(const event of parser.feed(chunk)) {
      writeSync(fd,JSON.stringify({source:'SYNTHETIC_HOST_REHEARSAL',...event})+'\n');
      if(event.type==='frame') frames++;
      else if(event.type==='status') status=event;
      else errors++;
    }
  }
  const end=parser.disconnect();
  const passed=frames===10000 && errors===0 && end.discardedBytes===0 &&
    status?.counters.accepted==='10000' && status?.counters.drained==='10000' && status?.counters.droppedFull==='0';
  const report={passed,source:'SYNTHETIC_HOST_REHEARSAL',frames,errors,trailingBytes:end.discardedBytes,
    counters:status?.counters,hardwareOverruns:null,physicalValidation:'NOT_RUN',writeStrategy:'SIMULATION_ONLY'};
  writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output,...report},null,2));
  if(!passed) process.exitCode=1;
} finally { if(fd!==undefined) closeSync(fd); fixture.cleanup(); }
