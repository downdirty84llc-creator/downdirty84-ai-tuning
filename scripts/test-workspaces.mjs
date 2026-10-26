// Headless, local-only regression checks. API requests are synthetic route mocks.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {runtimeFiles} from '../products/dd84-desktop/scripts/runtime-files.mjs';
import {sample} from '../products/dd84-desktop/project.mjs';
import {blankCase,caseReport,parseCase} from '../products/dd84-desktop/troubleshooting.mjs';
import {testJobCases} from './test-job-cases.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
assert.equal((await fs.readFile(path.join(root,'backend/shared/troubleshooting.mjs'),'utf8')).replaceAll('\r\n','\n'),(await fs.readFile(path.join(root,'products/dd84-desktop/troubleshooting.mjs'),'utf8')).replaceAll('\r\n','\n'),'Backend and desktop/web troubleshooting catalogs differ');
const output=process.env.DD84_TEST_OUTPUT || await fs.mkdtemp(path.join(os.tmpdir(),'dd84-workspaces-'));
await fs.mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon','.json':'application/json'};
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');let name=decodeURIComponent(url.pathname);let file;
  if(name.startsWith('/studio/')){name=name.slice(8)||'index.html';if(!runtimeFiles.includes(name)){res.writeHead(404).end();return;}file=path.join(root,'products/dd84-desktop',name);}
  else {file=path.resolve(root,'dist','.'+name);if(!file.startsWith(path.join(root,'dist')+path.sep)){res.writeHead(404).end();return;}try{if(!(await fs.stat(file)).isFile())throw Error();}catch{file=path.join(root,'dist/index.html');}}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
}catch{res.writeHead(500).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.DD84_BROWSER_CHANNEL?{channel:process.env.DD84_BROWSER_CHANNEL}:{})});
let passed=0;const ok=message=>{console.log(`PASS ${message}`);passed++;};
const visible=async locator=>assert(await locator.isVisible());
const text=async(locator,pattern)=>{await locator.filter({hasText:pattern}).first().waitFor({state:'visible'});};
const noOverflow=async page=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Viewport overflows');
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/studio/');await page.locator('[data-workspace=home] h1').waitFor();
  assert.equal(await page.locator('[data-workspace]:visible').count(),1);
  assert(await page.locator('.studio-brand img').evaluate(img=>img.complete&&img.naturalWidth>0));
  await noOverflow(page);await page.screenshot({path:path.join(output,'studio-home.png'),fullPage:true});ok('branded desktop home and one visible workspace');
  await page.locator('#nav-open').click();await page.locator('#new').click();
  await page.locator('#name').fill('Synthetic workspace regression');await page.locator('#name').press('Tab');
  const original=sample();const cell=page.locator('#parameter-table input[type=number]').first();const value=Number(await cell.inputValue());await cell.fill(String(value+1));await cell.press('Tab');
  await page.locator('#workspace-navigation [data-page=logs]').click();await page.locator('#nav-open').click();assert.equal(await page.locator('#name').inputValue(),'Synthetic workspace regression');assert.equal(Number(await cell.inputValue()),value+1);
  await page.locator('#undo').click();assert.equal(Number(await cell.inputValue()),value);
  const d1=page.waitForEvent('download');await page.locator('#save').click();const downloaded=await d1;const saved=JSON.parse(await fs.readFile(await downloaded.path(),'utf8'));assert.deepEqual(saved,{...original,name:'Synthetic workspace regression'});ok('project edit, navigation, undo and complete saved-project comparison');
  for(const workspace of ['comparisons','learning','device','help']){await page.locator(`#workspace-navigation [data-page=${workspace}]`).click();assert.equal(await page.locator('[data-workspace]:visible').count(),1);}
  await page.locator('#workspace-navigation [data-page=troubleshoot]').click();await page.locator('#trouble-issue').selectOption('fuel');await page.locator('#trouble-vehicle').fill('Synthetic 408 bench case');await page.locator('#trouble-symptom').fill('Pressure reading changes; no real vehicle test.');await page.locator('#trouble-relationship').selectOption('mismatch');await page.locator('#trouble-check-fuel-supply').selectOption('issue');await page.locator('#trouble-note-fuel-supply').fill('Synthetic concern for workflow validation.');
  await text(page.locator('.trouble-status'),/Concerns recorded/);const expected=blankCase();expected.issueId='fuel';expected.context.vehicle='Synthetic 408 bench case';expected.context.symptom='Pressure reading changes; no real vehicle test.';expected.relationship='mismatch';expected.checks['fuel-supply']={status:'issue',note:'Synthetic concern for workflow validation.'};
  const d2=page.waitForEvent('download');await page.getByRole('button',{name:'Save troubleshooting case',exact:true}).click();const record=JSON.parse(await fs.readFile(await (await d2).path(),'utf8'));assert.deepEqual(record,caseReport(expected));
  await page.locator('#workspace-navigation [data-page=home]').click();await page.locator('#workspace-navigation [data-page=troubleshoot]').click();assert.equal(await page.locator('#trouble-vehicle').inputValue(),expected.context.vehicle);
  await page.locator('#trouble-open').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(record))});await page.getByRole('button',{name:'Keep current case',exact:true}).click();assert.equal(await page.locator('#trouble-vehicle').inputValue(),expected.context.vehicle);
  await page.locator('#trouble-open').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(record))});await page.getByRole('button',{name:'Replace current case',exact:true}).click();assert.equal(await page.locator('#trouble-note-fuel-supply').inputValue(),expected.checks['fuel-supply'].note);
  await page.locator('#trouble-open').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"format":"unknown"}')});await text(page.locator('.troubleshooting [role=status]'),/Could not open/);assert.equal(await page.locator('#trouble-vehicle').inputValue(),expected.context.vehicle);ok('troubleshooting save/reopen, mismatch, replacement cancellation and invalid-file preservation');
  await page.locator('#trouble-open').setInputFiles({name:'forged.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...blankCase(),assessment:{status:'READY_FOR_HUMAN_REVIEW'},sources:[{url:'javascript:alert(1)'}]}))});await text(page.locator('.trouble-status'),/More evidence needed/);assert.equal(await page.locator('.troubleshooting a[href^="javascript"]').count(),0);ok('saved claims cannot replace the recalculated evidence assessment');
  await page.setViewportSize({width:700,height:550});await noOverflow(page);await page.locator('#workspace-navigation [data-page=home]').click();await page.screenshot({path:path.join(output,'studio-small.png'),fullPage:true});assert.deepEqual(errors,[]);ok('desktop minimum window and all workspace modules load without runtime errors');
  await page.close();

  const web=await browser.newPage({viewport:{width:1280,height:900}}),webErrors=[];web.on('pageerror',e=>webErrors.push(e.message));
  const jobA='11111111-1111-4111-8111-111111111111',jobB='22222222-2222-4222-8222-222222222222';
  let failMe=true,analyzed=[],run=false,jobPosts=0,uploadPosts=0,loginPosts=0;
  const job=id=>({id,vehicle:id===jobA?'Synthetic vehicle A':'Synthetic vehicle B',platform:'GM',service_type:'LOG_REVIEW',status:'NEW'});
  await web.route('**/api/v1/**',async route=>{const req=route.request(),url=new URL(req.url()),p=url.pathname;let body={},status=200;
    if(p==='/api/v1/me'){if(failMe){status=503;body={message:'Synthetic temporary outage'};}else body={id:'synthetic-user',email:'fixture@example.test'};}
    else if(p==='/api/v1/jobs'&&req.method()==='GET')body={jobs:[job(jobA),job(jobB)]};
    else if(p==='/api/v1/jobs'){jobPosts++;await new Promise(r=>setTimeout(r,150));status=500;body={message:'Synthetic create failure'};}
    else if(p.startsWith('/api/v1/uploads/jobs/')){const id=p.split('/').at(-1);body={uploads:[{id:`file-${id}`,filename:id===jobA?'before-A.csv':'before-B.csv',kind:'LOG',size_bytes:1024}]};}
    else if(p==='/api/v1/uploads'){uploadPosts++;await new Promise(r=>setTimeout(r,150));status=500;body={message:'Synthetic upload failure'};}
    else if(p.endsWith('/analyze')){analyzed.push(req.postDataJSON());await new Promise(r=>setTimeout(r,150));run=true;status=202;body={runId:'synthetic-run',status:'QUEUED'};}
    else if(p.endsWith('/latest-run'))body={run:run?{runId:'synthetic-run',status:'SUCCEEDED',progress:{pct:100,stage:'DONE'},errors:[]}:null};
    else if(p.endsWith('/troubleshooting-cases'))body={cases:[],nextBefore:null};
    else if(p==='/api/v1/auth/start'){loginPosts++;await new Promise(r=>setTimeout(r,150));body={ok:true};}
    else {status=404;body={message:'Unmocked route'};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await web.goto(origin+'/dashboard');await text(web.getByRole('alert'),/Synthetic temporary outage/);assert.equal(await web.getByRole('link',{name:'Sign in →',exact:true}).count(),0);failMe=false;await web.getByRole('button',{name:'Reload workspace',exact:true}).click();await web.getByLabel('before-A.csv',{exact:false}).waitFor();
  await web.getByLabel('before-A.csv',{exact:false}).check();await web.getByRole('button',{name:/Synthetic vehicle B/}).click();await web.getByLabel('before-B.csv',{exact:false}).waitFor();assert(await web.getByRole('button',{name:'Analyze selected logs',exact:true}).isDisabled());
  await web.getByLabel('before-B.csv',{exact:false}).check();await web.getByRole('button',{name:'Analyze selected logs',exact:true}).dblclick();await text(web.getByRole('region',{name:'Analysis status'}),/Analysis completed/);assert.deepEqual(analyzed,[{logUploadIds:[`file-${jobB}`]}]);ok('transient API error recovery, existing upload selection, job isolation and analysis completion');
  await web.getByRole('button',{name:'Create job',exact:true}).dblclick();await text(web.getByRole('alert'),/Synthetic create failure/);assert.equal(jobPosts,1);assert(await web.getByRole('button',{name:'Create job',exact:true}).isEnabled());
  await web.locator('#job-upload').setInputFiles({name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from('synthetic')});await web.getByRole('button',{name:'Upload file',exact:true}).dblclick();await text(web.getByRole('alert'),/Synthetic upload failure/);assert.equal(uploadPosts,1);assert(await web.getByRole('button',{name:'Upload file',exact:true}).isEnabled());ok('failed creates/uploads remain retryable and duplicate clicks submit once');
  await web.getByRole('link',{name:'Troubleshoot',exact:true}).click();await web.locator('#trouble-vehicle').fill('Synthetic route preservation');await web.getByRole('link',{name:'Help',exact:true}).click();await web.getByRole('link',{name:'Troubleshoot',exact:true}).click();assert.equal(await web.locator('#trouble-vehicle').inputValue(),'Synthetic route preservation');
  const d3=web.waitForEvent('download');await web.getByRole('button',{name:'Save troubleshooting case',exact:true}).click();const shared=parseCase(await fs.readFile(await (await d3).path(),'utf8'));assert.equal(shared.context.vehicle,'Synthetic route preservation');ok('web navigation preserves the case and exports the shared desktop-compatible format');
  await web.screenshot({path:path.join(output,'web-troubleshoot.png'),fullPage:true});await web.setViewportSize({width:390,height:844});await noOverflow(web);await web.getByRole('link',{name:'Help',exact:true}).click();await web.getByRole('heading',{name:'Choose your next step.',exact:true}).waitFor();await web.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await noOverflow(web);await web.screenshot({path:path.join(output,'web-help-mobile.png'),fullPage:true});assert.deepEqual(webErrors,[]);ok('branded web routes and narrow mobile layout');

  const stale=await browser.newPage();let releaseOld;const oldResponse=new Promise(resolve=>{releaseOld=resolve;});
  await stale.route('**/api/v1/**',async route=>{const p=new URL(route.request().url()).pathname;let json={};if(p.endsWith('/me'))json={id:'synthetic-user',email:'fixture@example.test'};else if(p==='/api/v1/jobs')json={jobs:[job(jobA),job(jobB)]};else if(p===`/api/v1/uploads/jobs/${jobA}`){await oldResponse;json={uploads:[{id:'stale-A',filename:'stale-A.csv',size_bytes:10}]};}else if(p===`/api/v1/uploads/jobs/${jobB}`)json={uploads:[{id:'current-B',filename:'current-B.csv',size_bytes:10}]};else if(p.endsWith('/troubleshooting-cases'))json={cases:[],nextBefore:null};else if(p.endsWith('/latest-run'))json={run:{runId:'synthetic-failure',status:'FAILED',progress:{pct:100,stage:'FAILED'},errors:[{code:'SYNTHETIC',message:'Synthetic unsupported log'}]}};await route.fulfill({json});});
  await stale.goto(origin+'/dashboard');await stale.getByRole('button',{name:/Synthetic vehicle B/}).click();await stale.getByLabel('current-B.csv',{exact:false}).waitFor();releaseOld();await stale.evaluate(()=>new Promise(r=>setTimeout(r,150)));assert.equal(await stale.getByLabel('stale-A.csv',{exact:false}).count(),0);await text(stale.getByRole('region',{name:'Analysis status'}),/Synthetic unsupported log/);ok('late upload response cannot cross jobs and failed analysis remains visible after reopening');
  const signedOut=await browser.newPage();await signedOut.route('**/api/v1/**',route=>route.fulfill({status:401,json:{message:'Sign in required'}}));await signedOut.goto(origin+'/dashboard');await signedOut.getByRole('link',{name:'Sign in →',exact:true}).waitFor();assert.equal(await signedOut.getByRole('button',{name:'Create job',exact:true}).count(),0);ok('expired session offers sign-in rather than unusable job controls');
  // A new page avoids discarding the deliberately unsaved troubleshooting case.
  const login=await browser.newPage();await login.route('**/api/v1/auth/start',async route=>{loginPosts++;await new Promise(r=>setTimeout(r,150));await route.fulfill({json:{ok:true}});});await login.goto(origin+'/login');await login.getByLabel('Email address').fill('fixture@example.test');await login.getByLabel('Email address').press('Enter');await text(login.getByRole('status'),/Link sent/);assert.equal(loginPosts,1);ok('keyboard sign-in form submits and reports completion');
  await testJobCases({browser,origin,output,ok});
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed,desktopErrors:errors,webErrors,syntheticOnly:true},null,2));console.log(JSON.stringify({passed,output}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
