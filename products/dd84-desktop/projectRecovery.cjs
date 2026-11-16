const fs=require('node:fs/promises');
const path=require('node:path');
const {writeVerifiedCopy}=require('./saveFile.cjs');
const MAX_BYTES=8*1024*1024;
function recoveryFailure(error){
  if(error instanceof SyntaxError)return Error('Stored recovery data could not be read. It has not been overwritten. Save your current project to a normal file.');
  if(error.code==='ENOSPC')return Error('There is not enough free space for recovery. Save your project on another drive, then free space and retry.');
  if(error.code)return Error('Local recovery storage is unavailable or locked. Save your project to a normal file and retry.');
  return error;
}
function installProjectRecovery({win,ipcMain,folder,io=fs}){
  const target=path.join(folder,'project-recovery.json');let busy=false;
  const model=import('./projectRecovery.mjs');
  const trusted=event=>event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame;
  async function read(){
    try{const stat=await io.lstat(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)throw Error('Recovery file is unsupported; it has not been overwritten.');
      const bytes=await io.readFile(target);if(bytes.length>MAX_BYTES)throw Error('Recovery file exceeds its limit.');return (await model).recoveryRecord(JSON.parse(bytes.toString('utf8')));
    }catch(error){if(error.code==='ENOENT')return null;throw recoveryFailure(error);}
  }
  ipcMain.handle('dd84-recovery-read',event=>{if(!trusted(event))throw Error('Invalid caller.');return read();});
  ipcMain.handle('dd84-recovery-write',async(event,request)=>{
    if(!trusted(event))throw Error('Invalid caller.');
    if(!request||Object.keys(request).some(k=>!['expectedToken','enabled','snapshot'].includes(k))||!(request.expectedToken===null||typeof request.expectedToken==='string'))throw Error('Invalid recovery request.');
    if(busy)throw Error('A recovery update is already running. Retry after it finishes.');busy=true;
    try{const {makeRecoveryRecord}=await model,current=await read();if((current?.token??null)!==request.expectedToken)throw Error('Another window changed the recovery copy. Save your project file and reopen Studio to review it.');
      const next=makeRecoveryRecord(request.enabled,request.snapshot),bytes=Buffer.from(JSON.stringify(next,null,2));if(bytes.length>MAX_BYTES)throw Error('Recovery file exceeds its limit.');
      await io.mkdir(folder,{recursive:true});await writeVerifiedCopy(target,bytes,io);return next;
    }catch(error){throw recoveryFailure(error);}finally{busy=false;}
  });
  win.on('close',event=>{if(busy){event.preventDefault();win.webContents.send('dd84-save-wait');}});
  return {isBusy:()=>busy};
}
module.exports={installProjectRecovery};
