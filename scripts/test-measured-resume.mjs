import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {inspectMeasuredFile,summarizeMeasuredFile,byteFingerprint} from '../products/dd84-desktop/measuredCsv.mjs';
import {normalizeMeasuredReview} from '../products/dd84-desktop/measuredReview.mjs';
import {blankCase,caseReport} from '../products/dd84-desktop/troubleshooting.mjs';

export async function testMeasuredResume({browser,origin,output,ok}){
  const csv='HP Tuners CSV Log File\nVersion: 1.0\n[Channel Information]\n0,1,2,3,4\nOffset,RPM,MAP,Spark,TPS\ns,rpm,kPa,deg,%\n[Channel Data]\n0,900,40,10,10\n1,1000,50,20,20\n2,2000,60,30,30\n3,3000,70,40,40\n';
  const later=csv.replace('2,2000,60,30,30','2,2000,60,32,30');
  const file=(name,text)=>({name,mimeType:'text/csv',buffer:Buffer.from(text)});
  const side=async(text,name)=>{
    const loaded=await inspectMeasuredFile(Buffer.from(text),name);
    return {...summarizeMeasuredFile(loaded,{start:1,end:3,filters:[{channelId:'1',min:1000,max:2500},{channelId:'2',min:40,max:80},{channelId:'3',min:10,max:50},{channelId:'4',min:10,max:50}]}),
      tune:{name:'synthetic.hpt',bytes:4,sha256:await byteFingerprint(Buffer.from('fake')),associationNote:'Synthetic operator statement, no real tune tested.'}};
  };
  const state=blankCase();state.format='DD84_TROUBLESHOOTING_CASE_V2';
  state.context.vehicle='Synthetic source-resume regression';
  state.measuredReview=normalizeMeasuredReview({format:'DD84_MEASURED_REVIEW_V1',writeStrategy:'SIMULATION_ONLY',learningReady:false,automaticApplication:false,
    before:await side(csv,'earlier.csv'),after:await side(later,'later.csv'),
    outcome:{result:'inconclusive',changeReason:'Synthetic',changes:'None',conditions:'Synthetic fixture',criterion:'Preserve evidence',observation:'No vehicle tested',nextAction:'Review manually',reviewer:'Synthetic reviewer'}});
  const saved=caseReport(state);
  for(const mode of ['studio','web']){
    const page=await browser.newPage({viewport:mode==='studio'?{width:1280,height:900}:{width:390,height:844}}),errors=[];let requests=0;
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/v1/**',route=>{requests++;return route.fulfill({status:401,json:{message:'Synthetic signed-out session'}});});
    await page.goto(origin+(mode==='studio'?'/studio/':'/troubleshoot'));
    if(mode==='studio')await page.locator('#workspace-navigation [data-page=troubleshoot]').click();
    await page.locator('#trouble-open').setInputFiles(file('saved.json',JSON.stringify(saved)));
    const panel=page.locator('section.measured-review'),status=panel.getByRole('status'),initialRequests=requests;
    await status.filter({hasText:'Saved measurement summary restored'}).waitFor();
    const resumeEarlier=page.getByLabel('Resume saved earlier CSV',{exact:true}),resumeLater=page.getByLabel('Resume saved later CSV',{exact:true});
    const build=page.getByRole('button',{name:'Build and attach measured review',exact:true});
    const save=async()=>{const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save troubleshooting case',exact:true}).click();return JSON.parse(await fs.readFile(await(await pending).path(),'utf8'));};
    await resumeEarlier.setInputFiles(file('renamed.csv',csv));await status.filter({hasText:'Earlier recording resumed'}).waitFor();
    await resumeLater.setInputFiles(file('later.csv',later));await status.filter({hasText:'Later recording resumed'}).waitFor();
    for(const title of ['Earlier','Later']){
      assert.equal(await page.getByLabel(title+' start seconds',{exact:true}).inputValue(),'1');
      assert.equal(await page.getByLabel(title+' end seconds',{exact:true}).inputValue(),'3');
      for(let n=1;n<=4;n++)assert.equal(await page.getByLabel(title+' filter '+n,{exact:true}).inputValue(),String(n));
      assert.equal(await page.getByLabel(title+' tune-to-log association',{exact:true}).inputValue(),saved.measuredReview.before.tune.associationNote);
    }
    assert(await page.getByText(/Selected filename differs; identical bytes match/).isVisible());
    await build.click();await status.filter({hasText:'Measured review attached locally'}).waitFor();assert.deepEqual(await save(),saved);
    ok(mode+': resumed sources preserve four filters, windows, original filenames, tune bindings and the complete saved case');
    await resumeEarlier.setInputFiles(file('earlier.csv',later));await status.filter({hasText:'Could not resume: Different CSV selected'}).waitFor();
    assert.equal(await page.getByLabel('Earlier start seconds',{exact:true}).inputValue(),'1');
    assert.equal(await page.getByLabel('Earlier filter 4',{exact:true}).inputValue(),'4');
    await build.click();await status.filter({hasText:'Measured review attached locally'}).waitFor();assert.deepEqual(await save(),saved);
    const altered=structuredClone(saved);altered.measuredReview.before.channels.find(c=>c.name==='RPM').mean++;
    await page.locator('#trouble-open').setInputFiles(file('altered.json',JSON.stringify(altered)));await page.getByRole('button',{name:'Replace current case',exact:true}).click();
    await resumeEarlier.setInputFiles(file('earlier.csv',csv));await status.filter({hasText:'Saved measurements could not be reproduced'}).waitFor();
    assert.equal(await page.getByLabel('Earlier start seconds',{exact:true}).inputValue(),'');
    await page.locator('#trouble-open').setInputFiles(file('original.json',JSON.stringify(saved)));await page.getByRole('button',{name:'Replace current case',exact:true}).click();
    ok(mode+': wrong files and altered saved statistics cannot replace editing inputs or pass as resumed evidence');
    if(mode==='studio'){
      await page.evaluate(()=>{const read=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){if(this.name==='delayed.csv')return new Promise(resolve=>{window.releaseResume=()=>resolve(read.call(this));});return read.call(this);};});
      await resumeEarlier.setInputFiles(file('delayed.csv',csv));await status.filter({hasText:'Checking saved earlier CSV'}).waitFor();
      await page.getByLabel('Earlier start seconds',{exact:true}).fill('1.5');
      await page.getByLabel('What did you observe, and what supports it?',{exact:true}).fill('Edited while loading');
      await page.evaluate(()=>window.releaseResume());await status.filter({hasText:'Inputs changed while checking'}).waitFor();
      assert.equal(await page.getByLabel('Earlier start seconds',{exact:true}).inputValue(),'1.5');
      assert.equal(await page.getByLabel('What did you observe, and what supports it?',{exact:true}).inputValue(),'Edited while loading');
      await page.getByRole('button',{name:'Discard pending measured changes',exact:true}).click();assert.deepEqual(await save(),saved);
      await resumeEarlier.setInputFiles(file('delayed.csv',csv));await status.filter({hasText:'Checking saved earlier CSV'}).waitFor();
      await page.getByRole('button',{name:'New case',exact:true}).click();await page.getByRole('button',{name:'Replace current case',exact:true}).click();await page.evaluate(()=>window.releaseResume());
      await page.getByText('3. Compare measured differences and record the outcome',{exact:true}).click();
      await page.getByLabel('Earlier CSV',{exact:true}).setInputFiles(file('new.csv',later));await status.filter({hasText:'Recording loaded locally'}).waitFor();
      assert.equal(await page.getByLabel('Earlier start seconds',{exact:true}).inputValue(),'0');
      assert.equal(await page.getByLabel('Earlier filter 1',{exact:true}).inputValue(),'');
      assert.equal(await page.getByLabel('Earlier tune-to-log association',{exact:true}).inputValue(),'');
      assert.equal(await resumeEarlier.isVisible(),false);
      ok('late resume reads cannot overwrite newer edits or a replacement case; regular CSV selection still starts fresh');
    }else{
      await resumeEarlier.setInputFiles(file('earlier.csv',csv));await status.filter({hasText:'Earlier recording resumed'}).waitFor();
      await resumeLater.setInputFiles(file('later.csv',later));await status.filter({hasText:'Later recording resumed'}).waitFor();
      await page.getByLabel('Later filter 1 maximum',{exact:true}).fill('1500');await build.click();await status.filter({hasText:'Measured review attached locally'}).waitFor();
      const edited=await save();assert.deepEqual(edited.measuredReview.before,saved.measuredReview.before);assert.equal(edited.measuredReview.after.rows,1);assert.equal(edited.measuredReview.after.selection.filters.length,4);
      assert.deepEqual(edited.measuredReview.after.tune,saved.measuredReview.after.tune);assert.equal(edited.measuredReview.learningReady,false);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.getByLabel('Later start seconds',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'resume-measurements-mobile.png')});
      ok('mobile resumed edits recompute only the selected changes, retain other evidence and stay local');
    }
    assert.equal(requests,initialRequests);assert.deepEqual(errors,[]);await page.close();
  }
}
