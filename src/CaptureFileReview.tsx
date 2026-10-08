import {useRef,useState} from 'react';
import {reviewCapture,exampleCapture,MAX_CAPTURE_BYTES,type CaptureReview} from './captureReview';

export default function CaptureFileReview() {
  const [result,setResult]=useState<CaptureReview|null>(null);
  const [name,setName]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const request=useRef(0); const input=useRef<HTMLInputElement>(null);
  function clear() {request.current++;setResult(null);setName('');setError('');setBusy(false);if(input.current)input.current.value='';}
  async function open(file:File) {
    clear(); const id=request.current;setBusy(true);
    try {
      if(file.size>MAX_CAPTURE_BYTES)throw new Error('Capture must be 8 MB or smaller.');
      const text=await file.text(); if(id!==request.current)return;
      const parsed=reviewCapture(text);setResult(parsed);setName(file.name);
    }catch(e){if(id===request.current)setError(e instanceof Error?e.message:'Could not read capture.');}
    finally{if(id===request.current)setBusy(false);}
  }
  return <section className="card link-section" aria-labelledby="capture-review-title">
    <span className="link-demo-label">LOCAL FILE REVIEW · SIMULATION</span>
    <h2 id="capture-review-title">Review a wired capture</h2>
    <p>Open the synthetic-capture.jsonl file from the wired rehearsal to inspect its frames and loss counts. Your file stays in this tab and is not uploaded.</p>
    <label>Wired rehearsal file (JSONL, up to 8 MB)
      <input ref={input} type="file" accept=".jsonl,application/x-ndjson" onChange={e=>{const file=e.target.files?.[0];if(file)void open(file);}} /></label>
    <div className="row"><button className="secondary" onClick={()=>{clear();setResult(reviewCapture(exampleCapture()));setName('Built-in example');}}>Load example capture</button>
      <button className="secondary" disabled={!result&&!error&&!busy} onClick={clear}>Clear file review</button></div>
    {busy&&<p role="status">Reading capture…</p>}{error&&<p role="alert">{error}</p>}
    {result&&<>
      <h3>{name}</h3><p className="small">Session {result.session} · Declared source: synthetic rehearsal. File labels are not proof of device identity.</p>
      <dl className="link-capture-metrics"><div><dt>Frames in file</dt><dd>{result.frames.toLocaleString()}</dd></div><div><dt>Missing record numbers</dt><dd>{result.gaps.toLocaleString()}</dd></div><div><dt>Duration (microseconds)</dt><dd>{result.durationUs}</dd></div></dl>
      <p>Channel 0: {result.channels[0].toLocaleString()} · Channel 1: {result.channels[1].toLocaleString()} · Classic CAN: {result.classic.toLocaleString()} · CAN-FD: {result.fd.toLocaleString()}</p>
      <p>Software queue drops: {result.counters?.droppedFull??'Unknown'} · Hardware overruns: unknown</p>
      {result.warnings.length?<ul role="status" className="link-capture-warning">{result.warnings.map(w=><li key={w}>{w}</li>)}</ul>:<p role="status">No sequence gaps or queue inconsistencies found in this file.</p>}
      <p className="small">Showing the first {result.preview.length} frames. This review does not verify hardware, firmware signatures or physical timing.</p>
      <div className="link-frame-table" tabIndex={0} role="region" aria-label="Capture frame preview">
        <table><thead><tr><th>Sequence</th><th>Time (µs)</th><th>Channel</th><th>ID</th><th>Type</th><th>Data (hex)</th></tr></thead>
        <tbody>{result.preview.map(f=><tr key={f.sequence}><td>{f.sequence}</td><td>{f.timestampUs}</td><td>{f.channel}</td><td>0x{f.id.toString(16)}</td><td>{f.fd?'FD':'Classic'}</td><td>{f.data||'Empty'}</td></tr>)}</tbody></table>
      </div>
    </>}
  </section>;
}
