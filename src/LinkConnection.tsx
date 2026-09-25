import {useEffect, useReducer, useState} from 'react';
import {captureReducer, initialCaptureState, captureReport, type Capture} from './linkCapture';

export default function LinkConnection() {
  const [state,dispatch]=useReducer(captureReducer,initialCaptureState);
  const [downloadError,setDownloadError]=useState('');
  const activeId=state.active?.id;
  useEffect(()=>{
    if (!activeId) return;
    const timer=window.setInterval(()=>dispatch({type:'tick',at:new Date().toISOString()}),250);
    return ()=>window.clearInterval(timer);
  },[activeId]);
  useEffect(()=>{
    const onHidden=()=>{if(document.hidden) dispatch({type:'hidden',at:new Date().toISOString()});};
    document.addEventListener('visibilitychange',onHidden);
    return ()=>document.removeEventListener('visibilitychange',onHidden);
  },[]);
  const latest=state.active ?? state.history[0];
  const status=state.connection === 'fault' ? 'Simulated fault' :
    state.connection === 'disconnected' ? 'Demo disconnected' : state.active ? 'Capturing simulated data' : 'Demo connected';
  function download(capture: Capture) {
    setDownloadError('');
    try {
      const url=URL.createObjectURL(new Blob([JSON.stringify(captureReport(capture),null,2)],{type:'application/json'}));
      const link=document.createElement('a'); link.href=url;
      link.download=`dd84-simulation-${capture.id}.json`; document.body.append(link); link.click(); link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch { setDownloadError('The report could not be downloaded. Please try again.'); }
  }
  return <section className="card link-section link-connection" aria-labelledby="connection-title">
    <div className="link-connection-heading">
      <div><span className="link-demo-label">SIMULATED DEVICE</span><h2 id="connection-title">Try a capture session</h2></div>
      <span className={`link-status link-status-${state.connection}`} role="status">{status}</span>
    </div>
    <p>Practice connecting DD84 LINK and collecting data before your hardware arrives. This demo runs only in this tab and does not connect to a vehicle.</p>
    <p className="small">Demo device: DD84-DEMO · Physical device: not connected</p>
    <div className="row">
      <button disabled={state.connection==='connected'} onClick={()=>dispatch({type:'connect'})}>
        {state.connection==='fault'?'Reconnect demo':'Connect demo'}</button>
      <button disabled={state.connection!=='connected'||!!state.active} onClick={()=>dispatch({type:'start',id:crypto.randomUUID(),at:new Date().toISOString()})}>Start simulated capture</button>
      <button className="secondary" disabled={!state.active} onClick={()=>dispatch({type:'stop',at:new Date().toISOString()})}>Stop capture</button>
      <button className="secondary" disabled={state.connection==='disconnected'} onClick={()=>dispatch({type:'disconnect',at:new Date().toISOString()})}>Disconnect demo</button>
    </div>
    <dl className="link-capture-metrics">
      <div><dt>Simulated frames received</dt><dd>{(latest?.received??0).toLocaleString()}</dd></div>
      <div><dt>Simulated frames missed</dt><dd>{(latest?.dropped??0).toLocaleString()}</dd></div>
      <div><dt>Capture</dt><dd>{state.active?'Running':latest?'Finished':'Not started'}</dd></div>
    </dl>
    {!!latest?.dropped && <p role="alert" className="link-capture-warning">This demo session missed {latest.dropped} simulated frames. The report records the loss.</p>}
    {state.connection==='fault' && <p role="alert">The simulated connection stopped. Reconnect the demo, then start a new capture. Your completed report is below.</p>}
    <details><summary>Test a connection problem</summary>
      <p className="small">These controls intentionally simulate a problem so you can see how it is reported.</p>
      <div className="row"><button className="secondary" disabled={!state.active} onClick={()=>dispatch({type:'drop',at:new Date().toISOString()})}>Simulate 5 missed frames</button>
      <button className="secondary" disabled={state.connection!=='connected'} onClick={()=>dispatch({type:'fault',at:new Date().toISOString()})}>Simulate connection fault</button></div>
    </details>
    <p className="small">Each capture ends at 10,000 generated frames. Leaving this tab stops capture. The latest 20 reports stay here until you reload or leave this page. Download reports you want to keep.</p>
    <h3>Demo session history</h3>
    {!state.history.length && <p>No completed captures yet. Connect the demo and start a capture to create your first report.</p>}
    <ul className="link-capture-history">{state.history.map(capture=><li key={capture.id}>
      <div><strong>{new Date(capture.startedAt).toLocaleString()}</strong><p className="small">{capture.reason} · {capture.received.toLocaleString()} received · {capture.dropped} missed</p>
      <span className="small">Session {capture.id.slice(0,8)} · Simulation</span></div>
      <button className="secondary" onClick={()=>download(capture)} aria-label={`Download simulation report ${capture.id.slice(0,8)}`}>Download report</button>
    </li>)}</ul>
    {downloadError && <p role="alert">{downloadError}</p>}
  </section>;
}
