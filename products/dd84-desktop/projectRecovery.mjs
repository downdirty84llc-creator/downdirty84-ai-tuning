import {validate} from './project.mjs';

export const RECOVERY_FORMAT='DD84_PROJECT_RECOVERY_V1';
export function recoverySnapshot(value){
  if(!value||Object.keys(value).some(k=>!['project','note'].includes(k))||typeof value.note!=='string'||value.note.length>2000)throw Error('Unsupported project recovery contents.');
  return {project:validate(value.project),note:value.note};
}
export function recoveryRecord(value){
  if(!value||Object.keys(value).some(k=>!['format','token','updatedAt','enabled','snapshot'].includes(k))||value.format!==RECOVERY_FORMAT||typeof value.token!=='string'||!/^[-a-f0-9]{36}$/.test(value.token)||typeof value.enabled!=='boolean'||typeof value.updatedAt!=='string'||!Number.isFinite(Date.parse(value.updatedAt))||(!value.enabled&&value.snapshot!==null))throw Error('Recovery data is unreadable or from an unsupported version. It has not been overwritten.');
  return {format:RECOVERY_FORMAT,token:value.token,updatedAt:value.updatedAt,enabled:value.enabled,snapshot:value.snapshot===null?null:recoverySnapshot(value.snapshot)};
}
export function makeRecoveryRecord(enabled,snapshot,token=crypto.randomUUID(),updatedAt=new Date().toISOString()){
  return recoveryRecord({format:RECOVERY_FORMAT,token,updatedAt,enabled,snapshot});
}
// A single read/write transaction compares the known generation before replacing
// the slot. Another window can never silently overwrite this session's copy.
export function openRecoveryStore(factory=globalThis.indexedDB){
  let opening;
  const open=()=>opening??=new Promise((resolve,reject)=>{
    if(!factory){reject(Error('Local recovery storage is unavailable. Save a project file instead.'));return;}
    const request=factory.open('dd84-project-recovery',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('recovery');
    request.onerror=()=>reject(Error('Local recovery storage could not be opened. Save a project file instead.'));
    request.onblocked=()=>reject(Error('Another Studio window is blocking recovery storage. Save your project file and close that window.'));
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
  });
  async function transaction(mode,action){
    const db=await open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('recovery',mode,{durability:'strict'}),store=tx.objectStore('recovery');let result,failure;
      tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(failure??Error('Recovery could not be stored. Storage may be full or unavailable; save a project file.'));
      if(mode==='readwrite'&&tx.durability!=='strict'){failure=Error('This runtime cannot confirm durable recovery writes. Save a project file instead.');tx.abort();return;}
      const request=store.get('project');request.onsuccess=()=>{try{const current=request.result===undefined?null:recoveryRecord(request.result);result=action(store,current);}catch(error){failure=error;tx.abort();}};
    });
  }
  return {
    read:()=>transaction('readonly',(_store,current)=>current),
    write:(expectedToken,enabled,snapshot)=>{
      const next=makeRecoveryRecord(enabled,snapshot);
      return transaction('readwrite',(store,current)=>{
        if((current?.token??null)!==expectedToken)throw Error('Another Studio window changed the recovery copy. Automatic recovery updates are paused. Save your project file, then reload to review the stored copy.');
        store.put(next,'project');return next;
      });
    }
  };
}
