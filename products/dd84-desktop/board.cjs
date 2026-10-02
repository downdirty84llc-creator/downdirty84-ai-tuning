const portPattern = /^COM[1-9][0-9]{0,3}$/;
function validateIdentity(value) {
  if (!value || value.protocol !== 'DD84-BENCH/1' || value.board !== 'FRDM-A-S32K344' ||
      value.mode !== 'bench' || value.vehicleAccess !== false ||
      typeof value.firmware !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.firmware) ||
      !Array.isArray(value.capabilities) || value.capabilities.length !== 3 ||
      !['ping','led','status'].every(c => value.capabilities.includes(c))) {
    throw Error('Unsupported DD84 board identity or capabilities.');
  }
  return {protocol:value.protocol,board:value.board,firmware:value.firmware,
    mode:'bench',vehicleAccess:false,capabilities:['ping','led','status']};
}
async function run(mode, port, SerialPort = require('serialport').SerialPort) {
  if (!['List','Probe'].includes(mode) || (mode === 'Probe' && (typeof port !== 'string' || !portPattern.test(port))))
    throw Error('Invalid board request.');
  const ports = (await SerialPort.list()).filter(p => p.vendorId?.toLowerCase() === '1357' && p.productId?.toLowerCase() === '0089' && portPattern.test(p.path)).map(p=>p.path);
  if (mode === 'List') return ports;
  if (!ports.includes(port)) throw Error('Select a connected NXP OpenSDA port.');
  return new Promise((resolve,reject)=>{
    const device = new SerialPort({path:port,baudRate:115200,dataBits:8,stopBits:1,parity:'none',rtscts:false,autoOpen:false});
    let finished=false, response='', total=0;
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
          try{finish(null,validateIdentity(JSON.parse(line)));}catch(e){finish(e);}
          return;
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
module.exports = {run,validateIdentity};
