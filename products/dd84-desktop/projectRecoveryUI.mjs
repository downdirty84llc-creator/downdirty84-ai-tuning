import {openRecoveryStore,recoverySnapshot} from './projectRecovery.mjs';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export function mountProjectRecovery(root,{getSnapshot,restore,store=globalThis.dd84Recovery??openRecoveryStore(),delay=400}){
  let record=null,ready=false,enabled=false,pending=false,busy=false,paused=false,timer=null,revision=0,disposed=false;
  root.classList.add('project-recovery');
  const details=el('details'),summary=el('summary','Calibration project recovery · checking local storage…');
  const privacy=el('p','Optional: keep one recovery copy of committed calibration project values and the project review note on this computer. It is not uploaded. Other workspaces, comparison notes, undo history, uncommitted cell text and native source files are not included. Save normal project and review files as backups.');
  const status=el('p');status.setAttribute('role','status');
  const buttons=el('div');buttons.className='row';
  const button=(label,action)=>{const b=el('button',label);b.type='button';b.onclick=action;buttons.append(b);return b;};
  const enable=button('Enable local project recovery',()=>void activate());
  const restoreButton=button('Restore recovered project',()=>void restoreCopy());
  const discard=button('Discard stored recovery copy',()=>void clear(true));
  const disable=button('Turn off recovery and delete its copy',()=>void clear(false));
  const retry=button('Retry recovery update',()=>{paused=false;void flush();});
  details.append(summary,privacy,status,buttons);root.append(details);
  function render(){
    summary.textContent=pending?'Recovered project available':enabled?'Calibration project recovery · '+(paused?'update paused':'on'):'Calibration project recovery · off';
    enable.hidden=enabled||pending;restoreButton.hidden=discard.hidden=!pending;disable.hidden=!enabled&&!pending;retry.hidden=!enabled||!paused||pending;
    for(const b of [enable,restoreButton,discard,disable,retry])b.disabled=!ready||busy;
  }
  function error(e){paused=true;status.textContent=e.message;details.open=true;render();}
  async function write(on,snapshot){record=await store.write(record?.token??null,on,snapshot);enabled=on;}
  async function activate(){
    if(!ready||busy)return;busy=true;const version=revision;render();
    try{await write(true,getSnapshot());paused=false;status.textContent='Local recovery enabled. '+(record.snapshot?'A recovery copy was stored.':'Open or edit a calibration project to create its copy.');}
    catch(e){error(e);}finally{busy=false;render();if(version!==revision)schedule();}
  }
  async function clear(keepEnabled){
    if(!ready||busy)return;busy=true;const version=++revision;clearTimeout(timer);render();
    try{await write(keepEnabled,null);pending=false;paused=false;status.textContent=keepEnabled?'Stored recovery copy discarded. Your open project is unchanged. Its next edit will create a new copy.':'Recovery is off and its stored copy was deleted. Normal saved project files are unchanged.';}
    catch(e){error(e);}finally{busy=false;render();if(version!==revision)schedule();}
  }
  async function restoreCopy(){
    if(!pending||busy)return;busy=true;render();
    try{
      // Claim the exact stored generation first; fail without touching the open
      // project if a second window has already replaced this recovery record.
      const snapshot=recoverySnapshot(record.snapshot);await write(true,snapshot);
      if(await restore(snapshot)){pending=false;paused=false;status.textContent='Project restored as unsaved work. Source verification and undo history were reset. Save a normal project file and review note separately.';}
      else status.textContent='Your current project was kept. The recovery copy remains available.';
    }catch(e){error(e);}finally{busy=false;render();}
  }
  async function flush(){
    if(!ready||disposed||!enabled||pending||paused||busy)return;busy=true;const version=revision;render();
    try{const snapshot=getSnapshot();await write(true,snapshot);status.textContent=snapshot?'Recovery copy updated '+new Date(record.updatedAt).toLocaleTimeString()+'. Save a normal project file separately.':'Recovery is enabled; no project is open.';}
    catch(e){error(e);}finally{busy=false;if(!disposed){render();if(version!==revision&&!paused)schedule();}}
  }
  function schedule(){clearTimeout(timer);if(ready&&enabled&&!pending&&!paused&&!busy){status.textContent='Latest project changes are waiting to be stored locally. Save a normal project file separately.';timer=setTimeout(()=>void flush(),delay);}}
  const changed=()=>{revision++;schedule();};
  const initialized=(async()=>{try{record=await store.read();if(disposed)return;enabled=record?.enabled??false;pending=!!record?.snapshot;
    if(pending){details.open=true;status.textContent=`Recovery copy: ${record.snapshot.project.name} · ${new Date(record.updatedAt).toLocaleString()}. Restore it or discard only this stored copy. Your current work will not be replaced automatically.`;}
    else status.textContent=enabled?'Recovery is enabled. The next project change will update its local copy.':'Recovery is off. Enable it if this computer is suitable for storing local project data.';
    ready=true;render();if(revision&&!pending)schedule();
  }catch(e){error(e);summary.textContent='Calibration project recovery · unavailable';}})();
  render();
  return {changed,initialized,flush,dispose:()=>{disposed=true;revision++;clearTimeout(timer);root.replaceChildren();}};
}
