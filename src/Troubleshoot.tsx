import {useEffect, useRef, useState} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {mountTroubleshooting,type TroubleshootingWorkspace} from '../products/dd84-desktop/troubleshootingUI.mjs';
import {apiFetch} from './client';
import {parseCaseHandoffSearch,caseHandoffPath,readHandoffSnapshot,type CaseHandoffReference} from './caseHandoff.mjs';
import '../products/dd84-desktop/troubleshooting.css';

type Handoff={reference:CaseHandoffReference|null;message:string;error:boolean;loading:boolean;expired?:boolean};
// Remains mounted across route changes, so a navigation click cannot discard a case.
export default function Troubleshoot() {
  const root=useRef<HTMLDivElement>(null),workspace=useRef<TroubleshootingWorkspace|null>(null),location=useLocation(),navigate=useNavigate();
  const [handoff,setHandoff]=useState<Handoff|null>(null),[retry,setRetry]=useState(0);
  const latest=useRef({navigate,pathname:location.pathname,search:location.search});latest.current={navigate,pathname:location.pathname,search:location.search};
  useEffect(()=>{const editor=mountTroubleshooting(root.current!, {externalLinks:true,onLocalCaseOpened:()=>{if(latest.current.pathname==='/troubleshoot'&&latest.current.search)latest.current.navigate('/troubleshoot',{replace:true});},save:async(value,filename)=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=filename;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    return {status:'unconfirmed'};
  }});workspace.current=editor;return()=>{workspace.current=null;editor();};},[]);
  useEffect(()=>{
    if(location.pathname!=='/troubleshoot'){setHandoff(null);return;}
    let reference:CaseHandoffReference|null;
    try{reference=parseCaseHandoffSearch(location.search);}catch(error){setHandoff({reference:null,message:(error as Error).message,error:true,loading:false});return;}
    const editor=workspace.current;
    if(!reference||!editor){setHandoff(null);return;}
    const selected=reference,version=editor.getOpenVersion(),controller=new AbortController();let active=true,cancelOffer=()=>{};
    const current=()=>active&&workspace.current===editor&&!controller.signal.aborted&&latest.current.pathname==='/troubleshoot'&&latest.current.search===location.search;
    setHandoff({reference:selected,message:'Loading the selected saved snapshot… Your current case stays open.',error:false,loading:true});
    void(async()=>{
      try{
        const response=await apiFetch(caseHandoffPath(selected),{signal:controller.signal,cache:'no-store'});
        const snapshot=readHandoffSnapshot(await response.json(),selected);
        if(!current())return;
        if(editor.getOpenVersion()!==version){setHandoff({reference:selected,message:'The workspace changed while this snapshot was loading. Your current work was kept. Retry when you are ready to open the snapshot.',error:true,loading:false});return;}
        setHandoff({reference:selected,message:'Snapshot retrieved. Choose whether to replace the current case below.',error:false,loading:false});
        cancelOffer=editor.openCase(snapshot.report,{label:(snapshot.report.context.caseName||'Saved job case')+' · '+(snapshot.report.context.vehicle||'Vehicle not recorded'),onDecision:decision=>{
          if(!current())return;
          setHandoff({reference:selected,message:decision==='opened'?'A local copy was opened for follow-up. The original job attachment remains unchanged. Save a separate JSON and attach it to the correct job when ready.':decision==='kept'?'Your current case was kept. Retry to open the selected snapshot later.':'The snapshot opening was canceled. Your current case was kept.',error:false,loading:false});
        }});
      }catch(error){if(current())setHandoff({reference:selected,message:error instanceof Error?error.message:'Could not retrieve this snapshot. Your current case was kept.',error:true,loading:false,expired:(error as {status?:number})?.status===401});}
    })();
    return()=>{active=false;controller.abort();cancelOffer();};
  },[location.pathname,location.search,retry]);
  return <div hidden={location.pathname!=='/troubleshoot'}><div className="container"><p>To share a case with DD84, save its JSON and <Link to="/dashboard">attach it to the matching job</Link>. This editor stays local until you choose to share a saved snapshot.</p>
    {handoff&&<section className="card case-handoff" aria-label="Saved job case handoff"><h2>Continue a saved job case</h2>
      {handoff.reference&&<p className="small">Job {handoff.reference.jobId} · Snapshot {handoff.reference.caseId} · {handoff.reference.access==='shop'?'Shop access':'Customer access'}</p>}
      <p role={handoff.error?'alert':'status'}>{handoff.message}</p>
      {handoff.expired&&<p><Link to="/login">Sign in again</Link>, then return to this link and retry.</p>}
      <div className="row">{handoff.reference&&<button className="secondary" disabled={handoff.loading} onClick={()=>setRetry(n=>n+1)}>Retry opening snapshot</button>}
        <Link to="/troubleshoot" replace>Continue current case</Link>
        {handoff.reference&&<Link to={handoff.reference.access==='shop'?'/admin?job='+handoff.reference.jobId:'/dashboard'}>{handoff.reference.access==='shop'?'Back to shop job':'My jobs'}</Link>}
      </div>
    </section>}
  </div><div className="container" ref={root}/></div>;
}
