import {useCallback,useEffect,useRef,useState} from 'react';
import {useBlocker,type BlockerFunction} from 'react-router-dom';

type Props={dirty:boolean;busy:boolean;description:string;onDiscard:()=>void;onSave?:()=>Promise<boolean>};

/** In-app navigation uses a DOM dialog; reload/close retains the browser's warning. */
export default function NavigationGuard({dirty,busy,description,onDiscard,onSave}:Props) {
  // The router registers predicates in an effect. Read current flags through a
  // stable predicate so a click immediately after clearing a field isn't stale.
  const flags=useRef({dirty,busy});flags.current={dirty,busy};
  const shouldBlock=useCallback<BlockerFunction>(({currentLocation,nextLocation})=>(flags.current.dirty||flags.current.busy)&&
    (currentLocation.pathname!==nextLocation.pathname||currentLocation.search!==nextLocation.search),[]);
  const blocker=useBlocker(shouldBlock);
  const latest=useRef(blocker);latest.current=blocker;
  const dialog=useRef<HTMLDialogElement>(null),saving=useRef(false);
  const [savePending,setSavePending]=useState(false),[error,setError]=useState('');
  const blocked=blocker.state==='blocked';
  useEffect(()=>{
    if(blocked){setError('');dialog.current?.showModal();}
    else dialog.current?.close();
  },[blocked]);
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if(dirty||busy){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty,busy]);
  function stay(){if(!saving.current&&latest.current.state==='blocked')latest.current.reset();}
  function leave(){if(busy||saving.current||latest.current.state!=='blocked')return;onDiscard();latest.current.proceed();}
  async function saveAndLeave(){
    if(!onSave||busy||saving.current)return;saving.current=true;setSavePending(true);setError('');
    try{if(await onSave()){if(latest.current.state==='blocked')latest.current.proceed();}else setError('The notes were not saved. Stay here and retry; your draft is still open.');}
    catch{setError('The notes were not saved. Stay here and retry; your draft is still open.');}
    finally{saving.current=false;setSavePending(false);}
  }
  return blocked?<dialog ref={dialog} className="navigation-guard" aria-labelledby="navigation-guard-title" aria-describedby="navigation-guard-description" onCancel={event=>{event.preventDefault();stay();}}>
    <h2 id="navigation-guard-title">{busy||savePending?'Saving your work…':'Before you leave'}</h2>
    <p id="navigation-guard-description">{busy||savePending?'Wait for the current request to finish before leaving this page.':dirty?description:'The request has finished. You can continue to the page you selected.'}</p>
    {error&&<p role="alert">{error}</p>}
    <div className="row">
      <button autoFocus onClick={stay} disabled={savePending}>Keep editing notes</button>
      {onSave&&dirty&&<button onClick={()=>void saveAndLeave()} disabled={busy||savePending}>Save notes and continue</button>}
      <button className="secondary" onClick={leave} disabled={busy||savePending}>{dirty?'Discard notes and leave':'Continue to selected page'}</button>
    </div>
  </dialog>:null;
}
