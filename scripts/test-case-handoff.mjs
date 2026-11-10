import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {caseHandoffHref} from '../src/caseHandoff.mjs';
import {blankCase,caseReport} from '../products/dd84-desktop/troubleshooting.mjs';

export async function testCaseHandoff({browser,origin,output,ok,measuredCase}){
  const jobId='11111111-1111-4111-8111-111111111111',caseA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',caseB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const state=structuredClone(measuredCase);state.context.caseName='Follow-up fixture';state.context.vehicle='Vehicle A';
  const report=caseReport(state),other=caseReport({...state,context:{...state.context,vehicle:'Vehicle B',caseName:'Second fixture'}});
  const snapshot=(id=caseA)=>({id,jobId,createdAt:'2026-11-10T15:00:00Z',sha256:'a'.repeat(64),report:id===caseA?report:other});
  const href=(id=caseA,access='customer')=>caseHandoffHref({jobId,caseId:id,access});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],requests=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));let failure=0,wrong=false,release,delay=false;
  await page.route('**/api/v1/**',async route=>{
    const request=route.request(),p=new URL(request.url()).pathname;requests.push(p);if(!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(p);
    let json={},status=200;
    if(p.endsWith('/me'))json={id:'fixture',email:'fixture@example.test'};
    else if(p==='/api/v1/jobs')json={jobs:[{id:jobId,vehicle:'Vehicle A',platform:'GM',service_type:'LOG_REVIEW',status:'NEW'}]};
    else if(p.includes('/uploads/jobs/'))json={uploads:[]};
    else if(p.endsWith('/latest-run'))json={run:null};
    else if(p.endsWith('/troubleshooting-cases'))json={cases:[{id:caseA,createdAt:snapshot().createdAt,caseName:'Follow-up fixture',vehicle:'Vehicle A',issueId:report.issueId,status:report.assessment.status,concerns:0,missing:0}],nextBefore:null};
    else if(p.endsWith('/'+caseA)||p.endsWith('/'+caseB)){
      if(delay&&p.endsWith('/'+caseA))await new Promise(resolve=>release=resolve);
      if(failure){status=failure;json={message:'Synthetic access failure'};}
      else json={case:{...snapshot(p.endsWith('/'+caseB)?caseB:caseA),...(wrong?{jobId:'22222222-2222-4222-8222-222222222222'}:{})}};
    }else{status=404;json={message:'No synthetic route'};}
    await route.fulfill({status,json}).catch(()=>{});
  });
  const handoff=page.getByRole('region',{name:'Saved job case handoff'});
  const waitForHeldRead=async()=>{for(let n=0;n<300&&!release;n++)await page.waitForTimeout(100);assert(release,'Expected a held snapshot request');};
  const navigate=async url=>page.evaluate(url=>{history.pushState({},'',url);dispatchEvent(new PopStateEvent('popstate'));},url);
  await page.goto(origin+'/dashboard');await page.getByRole('button',{name:/Follow-up fixture/}).click();
  const savedPanel=page.getByRole('region',{name:'Saved case snapshot'});await savedPanel.getByRole('link',{name:'Open in Troubleshooting',exact:true}).click();
  await handoff.getByRole('status').filter({hasText:'A local copy was opened'}).waitFor();assert.equal(await page.locator('#trouble-vehicle').inputValue(),'Vehicle A');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save troubleshooting case',exact:true}).click();assert.deepEqual(JSON.parse(await fs.readFile(await(await download).path(),'utf8')),report);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,'case-handoff-mobile.png')});
  ok('a saved customer snapshot opens directly as an unchanged local V2 case with complete measurements');
  await page.getByLabel('What did you observe, and what supports it?',{exact:true}).fill('Synthetic follow-up observation');await page.getByRole('button',{name:'Update outcome notes',exact:true}).click();
  const revisedDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Save troubleshooting case',exact:true}).click();const revised=JSON.parse(await fs.readFile(await(await revisedDownload).path(),'utf8'));
  assert.equal(revised.measuredReview.outcome.observation,'Synthetic follow-up observation');assert.deepEqual(revised.measuredReview.before,report.measuredReview.before);assert.deepEqual(revised.measuredReview.after,report.measuredReview.after);assert.notEqual(report.measuredReview.outcome.observation,'Synthetic follow-up observation');
  ok('follow-up notes save as a separate full case while measurements and the original attachment remain unchanged');
  await page.locator('#trouble-vehicle').fill('Unsaved local changes');await navigate(href(caseB));await page.getByRole('button',{name:'Keep current case',exact:true}).waitFor();assert.equal(await page.locator('#trouble-vehicle').inputValue(),'Unsaved local changes');
  assert.equal(await page.getByRole('button',{name:'Keep current case',exact:true}).evaluate(node=>node===document.activeElement),true);await page.keyboard.press('Enter');await handoff.getByRole('status').filter({hasText:'Your current case was kept'}).waitFor();
  await handoff.getByRole('button',{name:'Retry opening snapshot',exact:true}).click();await page.getByRole('button',{name:'Replace current case',exact:true}).click();assert.equal(await page.locator('#trouble-vehicle').inputValue(),'Vehicle B');assert.equal(report.context.vehicle,'Vehicle A');
  ok('dirty work needs an explicit replacement choice; keep and retry preserve the original job attachment');
  for(const status of [401,403,404,503]){failure=status;await navigate(href(caseA,status===403?'shop':'customer'));await handoff.getByRole('alert').filter({hasText:'HTTP '+status}).waitFor();assert.equal(await page.locator('#trouble-vehicle').inputValue(),'Vehicle B');assert.equal(await handoff.getByRole('link',{name:'Sign in again',exact:true}).count(),status===401?1:0);await navigate('/troubleshoot');}
  failure=0;wrong=true;await navigate(href());await handoff.getByRole('alert').filter({hasText:'does not match'}).waitFor();assert.equal(await page.locator('#trouble-vehicle').inputValue(),'Vehicle B');wrong=false;
  const count=requests.filter(p=>p.includes('/troubleshooting-cases/')).length;
  await navigate('/troubleshoot?job=bad&case='+caseA);await handoff.getByRole('alert').filter({hasText:'invalid'}).waitFor();assert.equal(requests.filter(p=>p.includes('/troubleshooting-cases/')).length,count);
  ok('invalid links, mismatched job responses, expired sessions and denied/missing/failed reads preserve the current case');
  await navigate('/troubleshoot');delay=true;await navigate(href());await page.waitForFunction(()=>document.querySelector('.case-handoff [role=status]')?.textContent.includes('Loading'));
  await waitForHeldRead();
  await navigate(href(caseB,'shop'));await handoff.getByRole('status').filter({hasText:'A local copy was opened'}).waitFor();delay=false;release();release=null;
  await page.waitForTimeout(60);assert.equal(await page.locator('#trouble-vehicle').inputValue(),'Vehicle B');assert(requests.includes(`/api/v1/admin/jobs/${jobId}/troubleshooting-cases/${caseB}`));
  ok('late customer responses cannot replace a newer shop snapshot, and shop links retain the admin permission endpoint');
  await navigate('/troubleshoot');delay=true;await navigate(href());await waitForHeldRead();
  await page.locator('#trouble-vehicle').fill('Typed while loading');delay=false;release();release=null;
  await handoff.getByRole('alert').filter({hasText:'workspace changed'}).waitFor();assert.equal(await page.locator('#trouble-vehicle').inputValue(),'Typed while loading');assert.equal(await page.getByRole('button',{name:'Replace current case',exact:true}).isVisible(),false);
  await handoff.getByRole('button',{name:'Retry opening snapshot',exact:true}).click();await page.getByRole('button',{name:'Keep current case',exact:true}).waitFor();await handoff.getByRole('link',{name:'Continue current case',exact:true}).click();await page.getByRole('button',{name:'Replace current case',exact:true}).waitFor({state:'hidden'});
  assert.equal(await page.locator('#trouble-vehicle').inputValue(),'Typed while loading');assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  ok('edits during loading invalidate the opening; leaving the handoff cancels pending replacement without any write requests');
  await page.close();

  // The same shared workspace also runs offline in Studio. Exercise a delayed
  // native save and competing local file read without touching user files.
  const studio=await browser.newPage();await studio.goto(origin+'/studio/');
  await studio.evaluate(async()=>{
    const {mountTroubleshooting}=await import('/studio/troubleshootingUI.mjs');
    document.body.replaceChildren();const root=document.createElement('div');document.body.append(root);
    window.fixtureWorkspace=mountTroubleshooting(root,{save:async(value)=>{window.savedFixture=value;await new Promise(resolve=>window.finishFixtureSave=resolve);return {status:'saved'};}});
  });
  await studio.evaluate(value=>window.fixtureWorkspace.openCase(value),report);await studio.locator('#trouble-vehicle').fill('Saving this revision');
  await studio.getByRole('button',{name:'Save troubleshooting case',exact:true}).click();await studio.evaluate(value=>{window.fixtureWorkspace.openCase(value,{label:'Incoming fixture'});},other);
  assert(await studio.getByRole('button',{name:'Replace current case',exact:true}).isDisabled());assert.equal(await studio.locator('#trouble-vehicle').inputValue(),'Saving this revision');
  await studio.evaluate(()=>window.finishFixtureSave());await studio.getByRole('button',{name:'Replace current case',exact:true}).click();assert.equal(await studio.locator('#trouble-vehicle').inputValue(),'Vehicle B');assert.equal(await studio.evaluate(()=>window.savedFixture.context.vehicle),'Saving this revision');
  await studio.getByRole('button',{name:'Preview printable case report',exact:true}).click();await studio.getByRole('dialog',{name:'DD84 case report preview',exact:true}).waitFor();await studio.evaluate(value=>{window.fixtureWorkspace.openCase(value);},report);assert.equal(await studio.getByRole('dialog',{name:'DD84 case report preview',exact:true}).count(),0);assert.equal(await studio.locator('#trouble-vehicle').inputValue(),'Vehicle A');
  await studio.evaluate(()=>{const original=File.prototype.text;File.prototype.text=async function(){if(this.name==='delayed.json')await new Promise(resolve=>window.finishFixtureRead=resolve);return original.call(this);};});
  await studio.locator('#trouble-open').setInputFiles({name:'delayed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});await studio.getByRole('button',{name:'New case',exact:true}).click();await studio.evaluate(()=>window.finishFixtureRead());await studio.waitForTimeout(60);assert.equal(await studio.locator('#trouble-vehicle').inputValue(),'');
  ok('Studio waits for an in-flight save before replacement and discards late file reads after New case');await studio.close();
}
