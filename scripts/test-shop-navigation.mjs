import assert from 'node:assert/strict';
import path from 'node:path';
import {blankCase,caseReport} from '../backend/shared/troubleshooting.mjs';

export async function testShopNavigation({browser,origin,output,ok}) {
  const jobA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',jobB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',missing='99999999-9999-4999-8999-999999999999';
  const diffId='33333333-3333-4333-8333-333333333333',caseId='44444444-4444-4444-8444-444444444444';
  const job=id=>({id,vehicle:id===jobA?'Recent synthetic car':'Older synthetic car',platform:'GM',service_type:'LOG_REVIEW',status:'IN_PROGRESS',internal_notes:'Saved notes for '+id,customer_email:'fixture@example.test'});
  const jobs={[jobA]:job(jobA),[jobB]:job(jobB)},gets=[],patches=[],decisions=[],errors=[];
  const caseInput=blankCase();caseInput.context.caseName='Linked case evidence';caseInput.context.vehicle=jobs[jobB].vehicle;
  const report=caseReport(caseInput);
  const item={diffSetId:diffId,jobId:jobB,runId:'fixture-run',customerEmail:'fixture@example.test',serviceType:'LOG_REVIEW',platform:'GM',vehicle:jobs[jobB].vehicle,createdAt:'2026-10-26T12:00:00Z',waitingHours:1,summary:{itemCount:2,approvedCount:0,suggestedCount:2,largestChangePct:2,lowestConfidence:0.9,hzRange:[2000,3000]},safety:{blockers:0,warnings:0,thresholdsConfirmed:true,thresholdProfile:'NA_GAS',findingCodes:[]},attention:[]};
  let failPatch=false,holdPatch=null,queueItems=[item],failDecision=true;
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/v1/**',async route=>{
    const request=route.request(),p=new URL(request.url()).pathname;let json={},status=200;
    if(p==='/api/v1/admin/queue')json={counts:{awaitingRelease:queueItems.length,oldestWaitingHours:1,jobsInProgress:2,failedRuns24h:0},items:queueItems};
    else if(p==='/api/v1/admin/jobs')json={jobs:[jobs[jobA]]}; // The linked job is outside the recent list.
    else if(p.endsWith('/troubleshooting-cases'))json={cases:[{id:caseId,createdAt:'2026-10-26T12:00:00Z',caseName:caseInput.context.caseName,vehicle:jobs[jobB].vehicle,issueId:report.issueId,status:report.assessment.status,concerns:0,missing:report.assessment.missing.length}],nextBefore:null};
    else if(p.endsWith('/troubleshooting-cases/'+caseId))json={case:{id:caseId,jobId:jobB,createdAt:'2026-10-26T12:00:00Z',report,sha256:'a'.repeat(64)}};
    else if(p.startsWith('/api/v1/admin/jobs/')){
      const id=p.split('/').at(-1);
      if(!jobs[id]){status=404;json={message:'Job not found.'};}
      else if(request.method()==='PATCH'){
        patches.push({id,body:request.postDataJSON()});if(holdPatch)await holdPatch;else await new Promise(resolve=>setTimeout(resolve,150));
        if(failPatch){status=503;json={message:'Synthetic note save failed'};}else{Object.assign(jobs[id],request.postDataJSON());json={ok:true};}
      }else{gets.push(id);json={job:jobs[id],uploads:[]};}
    }else if(p===`/api/v1/diffsets/${diffId}/release`){
      decisions.push(request.postDataJSON());await new Promise(resolve=>setTimeout(resolve,150));
      if(failDecision){status=503;json={message:'Synthetic decision failure'};}else{queueItems=[];json={diffSetId:diffId,releaseStatus:'REJECTED',releasedAt:null,customerNotified:null};}
    }else{status=404;json={message:'Unmocked synthetic endpoint'};}
    await route.fulfill({status,json});
  });
  const notes=page.locator('#internal-notes'),dialog=page.getByRole('dialog'),nav=page.getByRole('navigation',{name:'Main navigation'});
  await page.goto(origin+'/admin/queue');const handoff=page.getByRole('link',{name:'Review this job and case history'});await handoff.waitFor();
  assert.equal(await handoff.getAttribute('href'),'/admin?job='+jobB);await handoff.click();await notes.waitFor();
  assert.equal(new URL(page.url()).searchParams.get('job'),jobB);assert.equal(await notes.inputValue(),jobs[jobB].internal_notes);assert(gets.includes(jobB));
  const history=page.getByRole('region',{name:'Job troubleshooting cases'});await history.getByRole('button',{name:/Linked case evidence/}).click();await history.getByRole('region',{name:'Saved case snapshot'}).waitFor();assert.equal(decisions.length,0);ok('queue opens the exact older job outside the recent list and its evidence without submitting a decision');

  await notes.fill('Unsaved route draft');await nav.getByRole('link',{name:'Help',exact:true}).click();await dialog.waitFor();
  assert.equal(new URL(page.url()).searchParams.get('job'),jobB);assert.equal(patches.length,0);await dialog.getByRole('button',{name:'Keep editing notes'}).click();assert.equal(await notes.inputValue(),'Unsaved route draft');
  await page.goBack();await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await notes.inputValue(),'Unsaved route draft');
  await nav.getByRole('link',{name:'Help',exact:true}).click();await dialog.getByRole('button',{name:'Discard notes and leave'}).click();await page.getByRole('heading',{name:'Choose your next step.'}).waitFor();assert.equal(patches.length,0);
  await page.goBack();await notes.waitFor();assert.equal(await notes.inputValue(),jobs[jobB].internal_notes);ok('header links and browser Back protect drafts; cancel and Escape retain notes, explicit discard writes nothing');
  await page.goto(origin+'/admin?job='+jobB.toUpperCase());await notes.waitFor();assert.equal(await notes.inputValue(),jobs[jobB].internal_notes);

  await notes.fill('Draft saved before leaving');failPatch=true;await nav.getByRole('link',{name:'Help',exact:true}).click();await dialog.getByRole('button',{name:'Save notes and continue'}).dblclick();
  await dialog.getByRole('alert').waitFor();assert.equal(patches.length,1);assert.equal(new URL(page.url()).searchParams.get('job'),jobB.toUpperCase());assert.equal(await notes.inputValue(),'Draft saved before leaving');
  failPatch=false;await dialog.getByRole('button',{name:'Save notes and continue'}).dblclick();await page.getByRole('heading',{name:'Choose your next step.'}).waitFor();assert.equal(patches.length,2);assert.deepEqual(patches[1],{id:jobB,body:{internal_notes:'Draft saved before leaving'}});
  await page.goBack();await notes.waitFor();assert.equal(await notes.inputValue(),'Draft saved before leaving');ok('save-and-continue retries failures without leaving or losing a draft and submits once per attempt');

  await page.getByRole('button',{name:/Recent synthetic car/}).click();await page.locator('p').filter({hasText:'Vehicle: Recent synthetic car · '+jobA}).waitFor();
  await notes.fill('Draft before browser Back');await page.goBack();await dialog.waitFor();await dialog.getByRole('button',{name:'Discard notes and leave'}).click();await page.locator('p').filter({hasText:'Vehicle: Older synthetic car · '+jobB}).waitFor();
  await page.goForward();await page.locator('p').filter({hasText:'Vehicle: Recent synthetic car · '+jobA}).waitFor();assert.equal(await notes.inputValue(),jobs[jobA].internal_notes);ok('job selection is reflected in the URL and Back/Forward cannot move a draft into another job');

  let releaseSave;holdPatch=new Promise(resolve=>releaseSave=resolve);await notes.fill('Pending synthetic save');await page.getByRole('button',{name:'Save internal notes',exact:true}).click();await nav.getByRole('link',{name:'Help',exact:true}).click();await dialog.waitFor();
  assert(await dialog.getByRole('button',{name:'Discard notes and leave'}).isDisabled());assert.equal(new URL(page.url()).searchParams.get('job'),jobA);
  releaseSave();holdPatch=null;await dialog.getByRole('button',{name:'Continue to selected page'}).waitFor();await dialog.getByRole('button',{name:'Continue to selected page'}).click();await page.getByRole('heading',{name:'Choose your next step.'}).waitFor();
  assert.equal(jobs[jobA].internal_notes,'Pending synthetic save');ok('navigation waits for an in-flight save and then offers the requested destination');

  const getsBefore=gets.length;await page.goto(origin+'/admin?job=not-a-uuid');await page.getByRole('alert').filter({hasText:'job link is invalid'}).waitFor();assert.equal(gets.length,getsBefore);assert.equal(await notes.count(),0);
  await page.goto(origin+'/admin?job='+missing);await page.getByRole('alert').filter({hasText:'Job not found.'}).waitFor();assert.equal(await notes.count(),0);
  ok('invalid and missing job links never fall back to an unrelated vehicle');

  await page.goto(origin+'/admin/queue');const decisionNote=page.getByRole('textbox',{name:'Decision note for Older synthetic car'});await decisionNote.fill('Synthetic decision rationale');
  assert(await page.getByRole('button',{name:'Refresh',exact:true}).isDisabled());await page.getByRole('link',{name:'Review this job and case history'}).click();await dialog.waitFor();assert.equal(await dialog.getByRole('button',{name:'Save notes and continue'}).count(),0);await dialog.getByRole('button',{name:'Keep editing notes'}).click();assert.equal(await decisionNote.inputValue(),'Synthetic decision rationale');assert.equal(decisions.length,0);
  await page.getByRole('button',{name:'Reject',exact:true}).dblclick();await page.getByRole('status').filter({hasText:'Synthetic decision failure'}).waitFor();assert.equal(decisions.length,1);assert.equal(await decisionNote.inputValue(),'Synthetic decision rationale');
  failDecision=false;await page.getByRole('button',{name:'Reject',exact:true}).dblclick();await page.getByRole('heading',{name:'Nothing waiting on you'}).waitFor();assert.equal(decisions.length,2);assert.deepEqual(decisions[1],{decision:'REJECT',note:'Synthetic decision rationale'});await page.getByRole('link',{name:'Shop jobs'}).click();await page.getByRole('heading',{name:'Shop workspace',exact:true}).waitFor();assert.equal(await dialog.count(),0);
  ok('decision notes survive navigation cancellation and failed decisions; leaving never submits or releases a tune');

  const otherDiff='55555555-5555-4555-8555-555555555555';
  queueItems=[item,{...item,diffSetId:otherDiff,jobId:jobA,vehicle:jobs[jobA].vehicle}];await page.goto(origin+'/admin/queue');await page.getByRole('textbox',{name:'Decision note for Recent synthetic car'}).fill('Keep this other draft');
  const firstCard=page.locator('.card').filter({has:page.getByRole('heading',{name:'Older synthetic car',exact:true})});await firstCard.getByRole('button',{name:'Reject',exact:true}).click();
  const orphaned=page.getByRole('region',{name:'Draft notes for unavailable change lists'});await orphaned.waitFor();assert.equal(await orphaned.getByRole('textbox').inputValue(),'Keep this other draft');
  assert(await page.getByRole('button',{name:'Refresh',exact:true}).isDisabled());await orphaned.getByRole('button',{name:'Clear draft for '+otherDiff,exact:true}).click();await orphaned.waitFor({state:'hidden'});assert.equal(decisions.length,3);
  ok('a refreshed-away change list keeps another unsubmitted decision note visible for copying or clearing');

  queueItems=[{...item,safety:{...item.safety,blockers:1}}];await page.goto(origin+'/admin/queue');await page.getByRole('button',{name:'Release',exact:true}).waitFor();assert(await page.getByRole('button',{name:'Release',exact:true}).isDisabled());
  await page.setViewportSize({width:390,height:844});await page.getByRole('textbox',{name:'Decision note for Older synthetic car'}).fill('Mobile draft');await nav.getByRole('link',{name:'Help',exact:true}).click();await dialog.waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,'shop-navigation-guard-mobile.png')});await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await page.getByRole('textbox',{name:'Decision note for Older synthetic car'}).fill('');await nav.getByRole('link',{name:'Help',exact:true}).click();await page.getByRole('heading',{name:'Choose your next step.'}).waitFor({timeout:5000}).catch(async error=>{await page.screenshot({path:path.join(output,'navigation-failure.png')});console.log(JSON.stringify({url:page.url(),body:await page.locator('body').innerText(),errors}));throw error;});
  assert.deepEqual(errors,[]);ok('blocker-bearing queue entries cannot be released in the UI; keyboard and mobile navigation dialog work without runtime errors');await page.close();

  const denied=await browser.newPage();await denied.route('**/api/v1/**',route=>route.fulfill({status:403,json:{message:'Admin access required.'}}));await denied.goto(origin+'/admin?job='+jobB);await denied.getByRole('alert').filter({hasText:'Admin access required.'}).waitFor();assert.equal(await denied.locator('#internal-notes').count(),0);assert.equal(await denied.getByRole('region',{name:'Job troubleshooting cases'}).count(),0);await denied.close();ok('direct job links retain the server permission gate');
}
