// Explicit bench test: node board-hardware-test.cjs COM8
const assert=require('node:assert/strict');
const {SerialPort}=require('serialport');
const board=require('./board.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const path=process.argv[2];
 const identity=await board.run('Probe',path);
 const port=new SerialPort({path,baudRate:115200,autoOpen:false});
 let received='',transportError;
 port.on('data',data=>{received+=data.toString('ascii');});
 port.on('error',error=>{transportError=error;});
 const results=[];
 try{
  await new Promise((resolve,reject)=>port.open(e=>e?reject(e):resolve()));
  async function exchange(name,bytes,check,wait=400){
   received='';port.write(bytes);await delay(wait);
   if(transportError)throw transportError;
   check(received);results.push({name,response:received});
  }
  await exchange('bulk LED commands','led on\nstatus\nled off\nstatus\n',r=>assert.equal(r,'OK LED ON\r\nLED ON\r\nOK LED OFF\r\nLED OFF\r\n'));
  await exchange('100 command burst','ping\n'.repeat(100),r=>assert.equal(r,'PONG\r\n'.repeat(100)),1200);
  await exchange('oversize line rejection','x'.repeat(200)+'\nping\n',r=>assert.equal(r,'ERR LINE\r\nPONG\r\n'));
  await exchange('invalid byte rejection','led \x00on\nstatus\n',r=>assert.equal(r,'ERR LINE\r\nLED OFF\r\n'));
  await exchange('unsupported version','DD84 HELLO 2\n',r=>assert.equal(r,'ERR VERSION\r\n'));
  await exchange('fragmented line A','DD84 HEL',r=>assert.equal(r,''));
  await exchange('fragmented line B','LO 1\r\n',r=>assert.equal(board.validateIdentity(JSON.parse(r)).protocol,'DD84-BENCH/1'));
  // Deliberate receive load; must still recover after an explicit delimiter.
  await exchange('load','ping\n'.repeat(1500),()=>{},2200);
  await exchange('recovery after load','\nping\n',r=>assert.ok(r.endsWith('PONG\r\n')));
 }finally{if(port.isOpen)await new Promise(resolve=>port.close(resolve));}
 console.log(JSON.stringify({identity,passed:true,results},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
