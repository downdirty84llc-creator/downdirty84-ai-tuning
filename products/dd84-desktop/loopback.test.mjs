import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import board from './board.cjs';
const identity={protocol:'DD84-BENCH/1',board:'FRDM-A-S32K344',firmware:'0.2.0',mode:'bench',vehicleAccess:false,capabilities:['ping','led','status','can-loopback']};
const report=()=>({type:'loopback',source:'INTERNAL_CAN_LOOPBACK',passed:true,canStopped:true,stage:'complete',received:8,tickHz:40000000,
 frames:Array.from({length:8},(_,i)=>({sequence:i,id:801,timestampTicks:i*1000,data:(0xdd840000+i).toString(16)+(0x10203040+i).toString(16)}))});
test('validated loopback remains ineligible as vehicle/learning data',()=>{
 const v=board.validateLoopback(report());assert.equal(v.vehicleData,false);assert.equal(v.learningEligible,false);
 for(const change of [{source:'VEHICLE'},{received:7},{canStopped:false},{tickHz:0},{tickHz:'40000000'},{frames:[]},{stage:'start'}])assert.throws(()=>board.validateLoopback({...report(),...change}));
 for(const change of [{id:802},{sequence:9},{data:'00'},{timestampTicks:-1}]){
  const r=report();Object.assign(r.frames[2],change);assert.throws(()=>board.validateLoopback(r));
 }
 const r=report();r.frames[2].timestampTicks=1;assert.throws(()=>board.validateLoopback(r));
});
test('failed hardware tests are retained as failed, never promoted',()=>{
 const r={...report(),passed:false,received:0,frames:[],stage:'freeze',canStopped:false};
 assert.equal(board.validateLoopback(r).passed,false);
});
function fake(capable=true){
 return class extends EventEmitter {
  static latest;
  static async list(){return [{path:'COM8',vendorId:'1357',productId:'0089'}];}
  constructor(){super();this.writes=[];this.constructor.latest=this;}
  open(cb){this.isOpen=true;cb();} flush(cb){cb();} close(cb){this.isOpen=false;cb();}
  write(text,cb){
   this.writes.push(text);cb();
   const result=text.startsWith('\nDD84')?{...identity,capabilities:capable?identity.capabilities:['ping','led','status']}:report();
   const raw=JSON.stringify(result)+'\n';
   queueMicrotask(()=>{for(let i=0;i<raw.length;i+=13)this.emit('data',Buffer.from(raw.slice(i,i+13)));});
  }
 };
}
test('requires fresh supported handshake before fixed loopback request and closes port',async()=>{
 const Port=fake();const r=await board.run('Loopback','COM8',Port);
 assert.equal(r.received,8);assert.equal(r.identity.firmware,'0.2.0');
 assert.deepEqual(Port.latest.writes,['\nDD84 HELLO 1\n','can loopback\n']);assert.equal(Port.latest.isOpen,false);
});
test('old firmware receives no CAN command',async()=>{
 const Port=fake(false);await assert.rejects(board.run('Loopback','COM8',Port),/0.2.0/);
 assert.equal(Port.latest.writes.length,1);assert.equal(Port.latest.isOpen,false);
});
