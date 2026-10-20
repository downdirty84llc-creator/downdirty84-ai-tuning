import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import board from './board.cjs';
const identity={protocol:'DD84-BENCH/1',board:'FRDM-A-S32K344',firmware:'0.1.0',mode:'bench',vehicleAccess:false,capabilities:['ping','led','status']};
const device={path:'COM8',vendorId:'1357',productId:'0089'};
function fake(reply=JSON.stringify(identity)+'\r\n') {
 return class extends EventEmitter {
  static latest;
  static async list(){return [device,{path:'COM9',vendorId:'other',productId:'0089'}];}
  constructor(options){super();this.options=options;this.constructor.latest=this;}
  open(cb){this.isOpen=true;cb();}
  flush(cb){cb();}
  close(cb){this.isOpen=false;this.emit('close');cb();}
  write(text,cb){assert.equal(text,'\nDD84 HELLO 1\n');cb();queueMicrotask(()=>{this.emit('data',Buffer.from(reply.slice(0,12)));this.emit('data',Buffer.from(reply.slice(12)));});}
 };
}
test('accepts only supported bench capabilities',()=>{
 assert.equal(board.validateIdentity(identity).firmware,'0.1.0');
 for(const change of [{protocol:'DD84-BENCH/2'},{vehicleAccess:true},{mode:'vehicle'},{firmware:'x'},{capabilities:['flash']},{board:'other'}])assert.throws(()=>board.validateIdentity({...identity,...change}));
});
test('lists only eligible USB adapters and rejects arbitrary ports',async()=>{
 assert.deepEqual(await board.run('List',undefined,fake()),['COM8']);
 await assert.rejects(board.run('Probe','COM9',fake()));
 await assert.rejects(board.run('Probe','COM8; whoami',fake()));
});
test('accepts fragmented response and closes port',async()=>{
 const Port=fake();assert.equal((await board.run('Probe','COM8',Port)).protocol,'DD84-BENCH/1');
 assert.equal(Port.latest.isOpen,false);assert.equal(Port.latest.options.baudRate,115200);
});
test('rejects malformed, oversized and incompatible data and closes port',async()=>{
 for(const reply of ['{bad}\n','x'.repeat(4097),JSON.stringify({...identity,vehicleAccess:true})+'\n']){
  const Port=fake(reply);await assert.rejects(board.run('Probe','COM8',Port));assert.equal(Port.latest.isOpen,false);
 }
});
test('handles disconnect without unhandled errors',async()=>{
 const Port=fake();Port.prototype.write=function(){this.isOpen=false;this.emit('close');};
 await assert.rejects(board.run('Probe','COM8',Port),/disconnected/);
});
