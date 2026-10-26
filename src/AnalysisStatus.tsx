import {useEffect,useState} from 'react';
import {apiGet} from './client';
type Run={runId:string;status:string;progress:{pct:number;stage:string};errors:{code:string;message:string}[]};
export default function AnalysisStatus({jobId,refresh}:{jobId:string;refresh:number}) {
  const [run,setRun]=useState<Run|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0),[paused,setPaused]=useState(false);
  useEffect(()=>{
    let current=true, timer:ReturnType<typeof setTimeout>;let polls=0;
    setRun(null);setError('');setLoading(true);setPaused(false);
    async function poll(){
      try {const result=await apiGet<{run:Run|null}>(`/api/v1/jobs/${jobId}/latest-run`);if(!current)return;setRun(result.run);setLoading(false);
        if(result.run && ['QUEUED','RUNNING'].includes(result.run.status)){
          if(++polls<60)timer=setTimeout(poll,2000);else setPaused(true);
        }
      }catch(e){if(current){setError(e instanceof Error?e.message:'Could not load analysis status.');setLoading(false);}}
    }
    void poll();return()=>{current=false;clearTimeout(timer);};
  },[jobId,refresh,retry]);
  return <section className="analysis-status" aria-label="Analysis status"><h3>Analysis status</h3>
    {loading && <p role="status">Checking analysis…</p>}
    {error && <p role="alert">Status unavailable: {error}</p>}
    {!loading && !error && !run && <p>No analysis yet. Select the matching uploaded logs to begin.</p>}
    {run && <><p role="status">{run.status==='SUCCEEDED'?'Analysis completed. A tuner must review the findings before any change is released.':run.status==='FAILED'?'Analysis failed. Review the details below and correct the input before retrying.':run.status==='CANCELED'?'Analysis canceled.':`Analysis in progress · ${run.progress.stage.replaceAll('_',' ')}`}</p><p className="small">Run: {run.runId}</p>{run.errors?.length>0 && <ul>{run.errors.map((e,i)=><li key={i}>{e.message}</li>)}</ul>}</>}
    {paused && <p>Automatic status checks paused. The server may still be working.</p>}
    {(error||paused) && <button className="secondary" onClick={()=>setRetry(n=>n+1)}>Check status again</button>}
  </section>;
}
