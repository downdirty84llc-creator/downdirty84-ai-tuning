const portPattern = /^COM[1-9][0-9]{0,3}$/;
function validateIdentity(value) {
  if (!value || value.protocol !== 'DD84-BENCH/1' || value.board !== 'FRDM-A-S32K344' ||
      value.mode !== 'bench' || value.vehicleAccess !== false ||
      typeof value.firmware !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.firmware) ||
      !Array.isArray(value.capabilities) || ![3,4].includes(value.capabilities.length) ||
      new Set(value.capabilities).size !== value.capabilities.length ||
      value.capabilities.some(c => !['ping','led','status','can-loopback'].includes(c)) ||
      !['ping','led','status'].every(c => value.capabilities.includes(c))) {
    throw Error('Unsupported DD84 board identity or capabilities.');
  }
  return {protocol:value.protocol,board:value.board,firmware:value.firmware,
    mode:'bench',vehicleAccess:false,capabilities:[...value.capabilities]};
}
function validateLoopback(value) {
  if (!value || value.type !== 'loopback' || value.source !== 'INTERNAL_CAN_LOOPBACK' ||
      typeof value.passed !== 'boolean' || typeof value.canStopped !== 'boolean' ||
      !['freeze','reset','start','mode','receive','compare','complete'].includes(value.stage) ||
      !Number.isSafeInteger(value.received) || value.received < 0 || value.received > 8 ||
      !Number.isSafeInteger(value.tickHz) || value.tickHz <= 0 || value.tickHz > 1000000000 ||
      !Array.isArray(value.frames) || value.frames.length !== value.received ||
      (value.passed && (value.received !== 8 || !value.canStopped || value.stage !== 'complete'))) {
    throw Error('Invalid internal CAN test report.');
  }
  let previous = 0;
  const frames = value.frames.map((f,i) => {
    const expected = (0xdd840000+i).toString(16)+(0x10203040+i).toString(16);
    if (!f || f.sequence !== i || f.id !== 801 || f.data !== expected ||
        !Number.isSafeInteger(f.timestampTicks) || f.timestampTicks < previous || f.timestampTicks > 0xffffffff)
      throw Error('Internal CAN test frame failed validation.');
    previous=f.timestampTicks;
    return {sequence:i,id:801,timestampTicks:f.timestampTicks,data:f.data};
  });
  return {type:'loopback',source:'INTERNAL_CAN_LOOPBACK',passed:value.passed,
    canStopped:value.canStopped,stage:value.stage,received:value.received,tickHz:value.tickHz,
    frames,vehicleData:false,learningEligible:false};
}
async function run(mode, port, SerialPort = require('serialport').SerialPort) {
  if (!['List','Probe','Loopback'].includes(mode) || (mode !== 'List' && (typeof port !== 'string' || !portPattern.test(port))))
    throw Error('Invalid board request.');
  const ports = (await SerialPort.list()).filter(p => p.vendorId?.toLowerCase() === '1357' && p.productId?.toLowerCase() === '0089' && portPattern.test(p.path)).map(p=>p.path);
  if (mode === 'List') return ports;
  if (!ports.includes(port)) throw Error('Select a connected NXP OpenSDA port.');
  return new Promise((resolve,reject)=>{
    const device = new SerialPort({path:port,baudRate:115200,dataBits:8,stopBits:1,parity:'none',rtscts:false,autoOpen:false});
    let finished=false, response='', total=0, identity=null;
    const finish=(error,value)=>{
      if (finished) return;
      finished=true; clearTimeout(timer);
      const done=()=>error ? reject(error) : resolve(value);
      if(device.isOpen) device.close(closeError=>closeError ? reject(closeError) : done());
      else done();
    };
    const timer=setTimeout(()=>finish(Error('DD84 handshake timed out. Check the board firmware.')),5000);
    device.on('error',error=>finish(error));
    device.on('close',()=>{if(!finished)finish(Error('Board disconnected.'));});
    device.on('data',chunk=>{
      if(finished)return;
      total+=chunk.length;
      if(total>4096)return finish(Error('Device response exceeds limit.'));
      response+=chunk.toString('ascii');
      let end;
      while((end=response.indexOf('\n'))>=0){
        const line=response.slice(0,end).trim();response=response.slice(end+1);
        if(line.startsWith('{')){
          try {
            const value=JSON.parse(line);
            if (!identity) {
              identity=validateIdentity(value);
              if(mode === 'Probe'){finish(null,identity);return;}
              if(!identity.capabilities.includes('can-loopback'))throw Error('Install Bench 0.2.0 or later to run the internal CAN test.');
              device.write('can loopback\n',error=>{if(error)finish(error);});
            } else {
              finish(null,{identity,...validateLoopback(value)});return;
            }
          } catch(e){finish(e);return;}
        }
      }
    });
    device.open(error=>{
      if(error)return finish(error);
      if(finished){device.close(()=>{});return;}
      device.flush(error=>{
        if(error)return finish(error);
        if(!finished)device.write('\nDD84 HELLO 1\n',error=>{if(error)finish(error);});
      });
    });
  });
}
module.exports = {run,validateIdentity,validateLoopback};
