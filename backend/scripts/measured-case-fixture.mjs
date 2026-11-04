// Synthetic test data only; not part of the desktop runtime.
import {blankCase} from '../shared/troubleshooting.mjs';
export function measuredCaseFixture(){
  const side=(name,hash,value)=>({source:{name,sha256:hash.repeat(64),bytes:200,encoding:'UTF-8',format:'HP_TUNERS_CSV_1'},tune:null,selection:{start:0,end:1,filters:[]},rows:2,windowRows:2,invalidFilterRows:0,outsideFilterRows:0,duplicateTimes:0,channels:[{id:'0',name:'Offset',unit:'s',numeric:2,missing:0,text:0,min:0,max:1,mean:.5,median:.5,p95:1},{id:'1',name:'Spark',unit:'deg',numeric:2,missing:0,text:0,min:value,max:value,mean:value,median:value,p95:value}]});
  return {...blankCase(),format:'DD84_TROUBLESHOOTING_CASE_V2',measuredReview:{format:'DD84_MEASURED_REVIEW_V1',writeStrategy:'SIMULATION_ONLY',learningReady:false,automaticApplication:false,before:side('earlier.csv','a',20),after:side('later.csv','b',18),outcome:{result:'worse',changeReason:'Synthetic reason',changes:'Synthetic timing change',conditions:'Synthetic conditions',criterion:'Synthetic criterion',observation:'Synthetic concern only',nextAction:'Review sources',reviewer:'Fixture'}}};
}
