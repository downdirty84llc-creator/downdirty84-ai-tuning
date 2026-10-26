import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {blankCase,caseReport} from '../backend/shared/troubleshooting.mjs';

// Synthetic HTTP fixtures only: no customer jobs or production writes.
export async function testJobCases({browser,origin,output,ok}) {
  const jobA='11111111-1111-4111-8111-111111111111',jobB='22222222-2222-4222-8222-222222222222';
  const caseA='33333333-3333-4333-8333-333333333333',caseB='44444444-4444-4444-8444-444444444444';
  const job=id=>({id,vehicle:id===jobA?'Case vehicle A':'Case vehicle B',platform:'GM',service_type:'LOG_REVIEW',status:'NEW',internal_notes:'Existing shop notes',customer_email:'fixture@example.test'});
  const input=blankCase();input.context.caseName='Synthetic pressure case';input.context.vehicle='Case vehicle A';input.context.symptom='Synthetic pressure reading concern';input.relationship='mismatch';
  const report=caseReport(input),saved={id:caseA,jobId:jobA,createdAt:'2026-10-26T12:00:00Z',report,sha256:'a'.repeat(64)};
  const summary=id=>({id,createdAt:saved.createdAt,caseName:id===caseA?input.context.caseName:'Older synthetic case',vehicle:input.context.vehicle,issueId:input.issueId,status:report.assessment.status,concerns:report.assessment.concerns.length,missing:report.assessment.missing.length});
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],posts=[];
  page.on('pageerror',error=>errors.push(error.message));let attached=false,failSubmit=true,releaseOld;
  const oldResponse=new Promise(resolve=>releaseOld=resolve);let delayOld=false;
  await page.route('**/api/v1/**',async route=>{
    const request=route.request(),url=new URL(request.url()),p=url.pathname;let json={},status=200;
    if(p.endsWith('/me'))json={id:'fixture',email:'fixture@example.test'};
    else if(p==='/api/v1/jobs')json={jobs:[job(jobA),job(jobB)]};
    else if(p.includes('/uploads/jobs/'))json={uploads:[]};
    else if(p.endsWith('/latest-run'))json={run:null};
    else if(p.endsWith('/troubleshooting-cases')&&request.method()==='POST'){
      posts.push(request.postDataJSON());await new Promise(resolve=>setTimeout(resolve,150));
      if(failSubmit){status=503;json={message:'Synthetic temporary attachment failure'};}else{attached=true;json={case:saved};status=201;}
    }else if(p.endsWith('/troubleshooting-cases')){
      if(p.includes(jobA)&&delayOld)await oldResponse;
      json=p.includes(jobB)?{cases:[],nextBefore:null}:url.searchParams.has('before')?{cases:[summary(caseB)],nextBefore:null}:{cases:attached?[summary(caseA)]:[],nextBefore:attached?caseA:null};
    }else if(p.endsWith('/'+caseA))json={case:saved};
    else if(p.endsWith('/'+caseB))json={case:{...saved,id:caseB}};
    else{status=404;json={message:'Unmocked route'};}
    await route.fulfill({status,json});
  });
  await page.goto(origin+'/dashboard');const panel=page.getByRole('region',{name:'Job troubleshooting cases'});
  await panel.getByText('No troubleshooting cases attached yet.').waitFor();
  const file=(value,name='synthetic.json')=>({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  await panel.locator('input[type=file]').setInputFiles(file({...input,assessment:{status:'READY_FOR_HUMAN_REVIEW'},sources:[{url:'javascript:alert(1)'}]}));
  const preview=panel.getByRole('region',{name:'Case attachment preview'});
  await preview.getByText('Concerns recorded',{exact:false}).waitFor();assert.equal(posts.length,0);
  assert.equal(await preview.locator('a[href^="javascript:"]').count(),0);
  assert(await preview.getByRole('button',{name:'Attach case to this job',exact:true}).isDisabled());
  await preview.getByRole('checkbox').check();await preview.getByRole('button',{name:'Attach case to this job',exact:true}).dblclick();
  await panel.getByRole('alert').getByText('Synthetic temporary attachment failure').waitFor();assert.equal(posts.length,1);
  assert.deepEqual(posts[0].report,report);assert(await preview.getByRole('checkbox').isChecked());
  failSubmit=false;await preview.getByRole('button',{name:'Attach case to this job',exact:true}).dblclick();
  const snapshot=panel.getByRole('region',{name:'Saved case snapshot'});await snapshot.waitFor();
  assert.equal(posts.length,2);assert.equal(posts[0].requestId,posts[1].requestId);
  assert.equal(await preview.count(),0);ok('case preview requires confirmation, strips forged claims, and failed submissions retry with one stable identity');
  const download=page.waitForEvent('download');await snapshot.getByRole('button',{name:'Download saved case'}).click();
  assert.deepEqual(JSON.parse(await fs.readFile(await (await download).path(),'utf8')),report);
  await panel.getByRole('button',{name:'Load older cases'}).click();await panel.getByRole('button',{name:/Older synthetic case/}).waitFor();
  assert.equal(await panel.locator('.case-history li').count(),2);await panel.getByRole('button',{name:/Synthetic pressure case/}).click();await snapshot.getByText(input.context.symptom,{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,'job-case-mobile.png'),fullPage:true});
  await panel.locator('input[type=file]').setInputFiles(file({format:'HPT'},'invalid.json'));await panel.getByRole('alert').waitFor();assert.equal(await preview.count(),0);assert.equal(posts.length,2);
  ok('saved snapshots download without data loss, paginate, and render on mobile; invalid files never submit');
  delayOld=true;await page.getByRole('button',{name:/Case vehicle B/}).click();await panel.getByText('No troubleshooting cases attached yet.').waitFor();
  await page.getByRole('button',{name:/Case vehicle A/}).click();await panel.getByText('Loading case history…').waitFor();
  await page.getByRole('button',{name:/Case vehicle B/}).click();await panel.getByText('No troubleshooting cases attached yet.').waitFor();releaseOld();
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,150)));assert.equal(await panel.getByRole('button',{name:/Synthetic pressure case/}).count(),0);assert.equal(await snapshot.count(),0);
  assert.deepEqual(errors,[]);ok('late case history and attachment state cannot cross customer jobs');await page.close();

  const admin=await browser.newPage({viewport:{width:1280,height:900}}),adminErrors=[],patches=[];let releaseA,holdA=true;
  admin.on('pageerror',error=>adminErrors.push(error.message));const delayedA=new Promise(resolve=>releaseA=resolve);
  const jobs={[jobA]:job(jobA),[jobB]:job(jobB)};
  await admin.route('**/api/v1/**',async route=>{
    const request=route.request(),p=new URL(request.url()).pathname;let json={},status=200;
    if(p==='/api/v1/admin/jobs')json={jobs:Object.values(jobs)};
    else if(p.endsWith('/troubleshooting-cases'))json={cases:[summary(caseA)],nextBefore:null};
    else if(p.endsWith('/'+caseA)&&p.includes('/troubleshooting-cases/'))json={case:saved};
    else if(p.startsWith('/api/v1/admin/jobs/')){
      const id=p.split('/').at(-1);
      if(request.method()==='PATCH'){patches.push(request.postDataJSON());await new Promise(resolve=>setTimeout(resolve,150));Object.assign(jobs[id],request.postDataJSON());json={ok:true};}
      else{if(id===jobA&&holdA)await delayedA;json={job:jobs[id],uploads:[]};}
    }else{status=404;json={message:'Unmocked route'};}
    await route.fulfill({status,json});
  });
  await admin.goto(origin+'/admin');await admin.getByRole('button',{name:/Case vehicle A/}).click();await admin.getByText('Loading job…').waitFor();
  await admin.getByRole('button',{name:/Case vehicle B/}).click();await admin.locator('#internal-notes').waitFor();holdA=false;releaseA();await admin.evaluate(()=>new Promise(resolve=>setTimeout(resolve,150)));
  assert.equal(await admin.locator('#internal-notes').inputValue(),'Existing shop notes');assert.equal(await admin.getByText('Case vehicle A',{exact:true}).count(),0);
  const adminPanel=admin.getByRole('region',{name:'Job troubleshooting cases'});assert.equal(await adminPanel.locator('input[type=file]').count(),0);
  await adminPanel.getByRole('button',{name:/Synthetic pressure case/}).click();await adminPanel.getByRole('region',{name:'Saved case snapshot'}).waitFor();
  await admin.locator('#internal-notes').fill('Synthetic draft notes');await admin.locator('#internal-notes').press('Tab');assert.equal(patches.length,0);
  await admin.getByRole('button',{name:/Case vehicle A/}).click();await admin.getByRole('button',{name:'Keep editing notes'}).click();assert.equal(await admin.locator('#internal-notes').inputValue(),'Synthetic draft notes');
  await admin.getByRole('button',{name:'IN_PROGRESS',exact:true}).dblclick();await admin.getByText('Job status updated.',{exact:true}).waitFor();assert.deepEqual(patches,[{status:'IN_PROGRESS'}]);assert.equal(await admin.locator('#internal-notes').inputValue(),'Synthetic draft notes');
  await admin.getByRole('button',{name:'Save internal notes',exact:true}).dblclick();await admin.getByText('Internal notes saved.',{exact:true}).waitFor();assert.deepEqual(patches[1],{internal_notes:'Synthetic draft notes'});assert.equal(patches.length,2);
  await admin.locator('#internal-notes').fill('Discard me');await admin.getByRole('button',{name:/Case vehicle A/}).click();await admin.getByRole('button',{name:'Discard draft and open job'}).click();await admin.locator('p').filter({hasText:'Vehicle: Case vehicle A · '+jobA}).waitFor();assert.equal(await admin.locator('#internal-notes').inputValue(),'Existing shop notes');
  await admin.setViewportSize({width:390,height:844});assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await admin.screenshot({path:path.join(output,'shop-cases-mobile.png'),fullPage:true});
  assert.deepEqual(adminErrors,[]);ok('shop reads cases without customer attachment controls, ignores stale details, and explicitly saves notes without status updates erasing drafts');await admin.close();
}
