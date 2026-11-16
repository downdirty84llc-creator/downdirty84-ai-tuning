import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {installProjectRecovery} from './projectRecovery.cjs';
import {sample,edit} from './project.mjs';

const snapshot=()=>({project:edit(sample(),'Airflow.MAF.Curve',0,12),note:'Synthetic recovery test'});
async function folder(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'dd84-recovery-test-'));
  t.after(async()=>{for(const name of await fs.readdir(root))await fs.unlink(path.join(root,name));await fs.rmdir(root);});
  return root;
}
function fixture(folder,io=fs){
  const handlers=new Map(),win=new EventEmitter(),notifications=[];
  win.webContents={mainFrame:{},send:name=>notifications.push(name)};
  const service=installProjectRecovery({win,folder,io,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)}});
  const event={sender:win.webContents,senderFrame:win.webContents.mainFrame};
  return {service,notifications,read:()=>handlers.get('dd84-recovery-read')(event),
    write:(request,caller=event)=>handlers.get('dd84-recovery-write')(caller,request),
    untrustedRead:()=>handlers.get('dd84-recovery-read')({sender:{},senderFrame:{}}),
    close:()=>{let prevented=false;win.emit('close',{preventDefault:()=>prevented=true});return prevented;}};
}
const request=(expectedToken=null,enabled=true,value=snapshot())=>({expectedToken,enabled,snapshot:value});

test('native recovery survives reopening and disabling deletes only the fixed recovery contents',async t=>{
  const root=await folder(t),f=fixture(root);assert.equal(await f.read(),null);
  const saved=await f.write(request());assert.deepEqual(saved.snapshot,snapshot());assert.deepEqual(await fixture(root).read(),saved);
  await fs.writeFile(path.join(root,'normal-project.json'),'keep me');
  const disabled=await f.write(request(saved.token,false,null));assert.equal(disabled.enabled,false);assert.equal(disabled.snapshot,null);
  assert.equal(await fs.readFile(path.join(root,'normal-project.json'),'utf8'),'keep me');assert.deepEqual((await fs.readdir(root)).sort(),['normal-project.json','project-recovery.json']);
});
test('native recovery rejects stale generations without changing the latest copy',async t=>{
  const root=await folder(t),f=fixture(root),saved=await f.write(request());
  const latest=await f.write(request(saved.token,true,{project:sample(),note:'Newer copy'}));
  await assert.rejects(f.write(request(saved.token)),/Another window/);assert.deepEqual(await f.read(),latest);assert.equal(f.service.isBusy(),false);
});
test('untrusted callers, path injection and malformed recovery cannot write',async t=>{
  const root=await folder(t),f=fixture(root);assert.throws(()=>f.untrustedRead(),/Invalid caller/);
  await assert.rejects(f.write(request(),{sender:{},senderFrame:{}}),/Invalid caller/);
  for(const bad of [{...request(),filename:'elsewhere.json'},{...request(),enabled:false},{...request(),snapshot:{...snapshot(),verified:true}},null])await assert.rejects(f.write(bad));
  assert.deepEqual(await fs.readdir(root),[]);
});
test('invalid existing native recovery is preserved even by a discard request',async t=>{
  const root=await folder(t),f=fixture(root),target=path.join(root,'project-recovery.json');
  for(const text of ['not json',JSON.stringify({format:'FUTURE',snapshot:'preserve'})]){
    await fs.writeFile(target,text);await assert.rejects(f.read());await assert.rejects(f.write(request(null,false,null)));assert.equal(await fs.readFile(target,'utf8'),text);
  }
});
test('an interrupted native write retains the old copy and releases the busy guard',async t=>{
  const root=await folder(t),saved=await fixture(root).write(request());
  const f=fixture(root,{...fs,rename:async()=>{throw Object.assign(Error('Injected unavailable drive'),{code:'EIO'});}});
  await assert.rejects(f.write(request(saved.token)),/unavailable or locked/);assert.deepEqual(await f.read(),saved);assert.equal(f.close(),false);assert.equal(f.service.isBusy(),false);assert.deepEqual(await fs.readdir(root),['project-recovery.json']);
});
test('closing and duplicate updates are blocked until the recovery write completes',async t=>{
  const root=await folder(t);let release,entered;
  const hold=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
  const f=fixture(root,{...fs,rename:async(...args)=>{entered();await hold;return fs.rename(...args);}});
  const saving=f.write(request());await started;assert.equal(f.close(),true);assert.deepEqual(f.notifications,['dd84-save-wait']);await assert.rejects(f.write(request()),/already running/);
  release();const saved=await saving;assert.equal(f.close(),false);assert.deepEqual(await f.read(),saved);
});
test('oversized and symbolic recovery files are rejected before reading their contents',async()=>{
  for(const stat of [{isFile:()=>true,isSymbolicLink:()=>true,size:2},{isFile:()=>true,isSymbolicLink:()=>false,size:9*1024*1024}]){
    const f=fixture(os.tmpdir(),{...fs,lstat:async()=>stat,readFile:async()=>{assert.fail('Unsafe file was read');}});await assert.rejects(f.read(),/unsupported/);
  }
});
