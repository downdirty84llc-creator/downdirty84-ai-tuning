import { Link } from "react-router-dom";

export default function Help() {
  return <div className="container help-page">
    <p className="eyebrow">DD84 / GET STARTED</p><h1>Choose your next step.</h1>
    <p className="lead">Keep the vehicle, tune and recording together so every review has the right context.</p>
    <p><Link className="button-link" to="/troubleshoot">Troubleshoot a tuning problem →</Link></p>
    <div className="help-grid">
      <section className="card"><span className="eyebrow">01 / REQUEST</span><h2>Need a tune or log review?</h2><p>Start with your vehicle, controller, modifications, fuel and goal. DD84 confirms compatibility and service scope.</p><Link className="button-link" to="/buy">View services →</Link></section>
      <section className="card"><span className="eyebrow">02 / WORKSPACE</span><h2>Already have a job?</h2><p>Sign in with your email link, choose the job, upload your files and select the logs you want reviewed.</p><Link className="button-link" to="/dashboard">Open my jobs →</Link></section>
      <section className="card"><span className="eyebrow">03 / DESKTOP</span><h2>Using Calibration Studio?</h2><p>Open the extracted Windows app. Start in Calibration projects for DD84 drafts or Recorded logs for a VCM Scanner CSV. Its built-in file guide explains each supported format.</p><p className="small">Keep the entire extracted folder together. Save each workspace separately. Studio does not automatically upload your local files to this website.</p></section>
      <section className="card"><span className="eyebrow">04 / DEVICE</span><h2>Testing DD84 LINK?</h2><p>The current device workflow provides bench preparation and simulation. Vehicle flashing and automatic calibration changes remain unavailable.</p><Link className="button-link" to="/dd84-link">Open DD84 LINK →</Link></section>
    </div>
    <section className="card" style={{marginTop:20}}><h2>Before sending a file</h2><ol><li>Identify the exact vehicle, engine, controller and modifications.</li><li>Label the tune stage and explain which calibration was running during each log. Leave uncertain associations unconfirmed.</li><li>Keep an untouched original and all native source files. A DD84 report is not a backup of the original tune.</li><li>Include the file type, workspace and exact message when asking for help.</li></ol><p>HPT and Holley containers require validated controller definitions for native editing. The current desktop preview edits supported readable exports as separate DD84 drafts; native HPL measurements need a readable CSV export.</p></section>
  </div>;
}
