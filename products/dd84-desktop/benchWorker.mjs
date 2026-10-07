import {rehearsalBytes,reviewBenchCapture} from './bench.mjs';
self.onmessage=async({data})=>{
  try {
    const {mode,plan,session}=data;
    if(!['rehearse','compare'].includes(mode))throw Error('Unknown bench operation.');
    const bytes=mode==='rehearse' ? rehearsalBytes(plan,session) : new Uint8Array(data.buffer);
    const report=await reviewBenchCapture({plan,session,bytes,
      filename:mode==='rehearse'?'software-rehearsal.bin':data.filename,
      source:mode==='rehearse'?'SOFTWARE_REHEARSAL':'IMPORTED_CAPTURE_UNVERIFIED'});
    self.postMessage({report});
  }catch(error){self.postMessage({error:error.message});}
};
