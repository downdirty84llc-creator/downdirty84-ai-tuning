import {openSync,closeSync,readFileSync,writeFileSync,fstatSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {makeBenchPlan,compareBenchCapture} from '../shared/bench-acceptance.mjs';

// Output is exclusively created, never overwriting an earlier test's evidence.
try {
  const [mode,...args]=process.argv.slice(2);
  let output, result;
  if(mode==='plan' && [1,2].includes(args.length)) {
    output=args[0]; result=makeBenchPlan(randomBytes(4).toString('hex'),args[1]===undefined?1000:Number(args[1]));
  } else if(mode==='compare' && args.length===5) {
    const [input,session,runTag,count,destination]=args;
    const fd=openSync(input,'r'); let bytes;
    try {
      if(fstatSync(fd).size>16*1024*1024) throw Error('Capture exceeds 16 MiB.');
      bytes=readFileSync(fd);
    } finally {closeSync(fd);}
    result=compareBenchCapture(bytes,session,runTag,Number(count));
    result.inputSha256=createHash('sha256').update(bytes).digest('hex');
    output=destination;
  } else throw Error('Usage: plan OUTPUT.json [COUNT] | compare INPUT.bin SESSION RUN_TAG COUNT OUTPUT.json');
  writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(`Saved ${result.format}: ${output}`);
  if(mode==='compare' && !result.comparisonPassed) process.exitCode=1;
} catch(error) {console.error(error.message);process.exitCode=1;}
