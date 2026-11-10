import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {inspectMeasuredFile,summarizeMeasuredFile} from '../products/dd84-desktop/measuredCsv.mjs';
import {normalizeMeasuredReview} from '../products/dd84-desktop/measuredReview.mjs';
import {blankCase,caseReport} from '../products/dd84-desktop/troubleshooting.mjs';

export async function testMeasuredChannels({browser,origin,output,ok}){
  const csv=(rows,unit='kPa')=>'HP Tuners CSV Log File\nVersion: 1.0\n[Channel Information]\n0,1,2,3,4,5\nOffset,RPM,MAP,Spark,State,<img src=x>\ns,rpm,'+unit+',deg,,V\n[Channel Data]\n'+rows;
  const before=csv('0,1000,50,10,On,1\n1,2000,60,,Off,2\n2,3000,70,bad,On,3');
  const after=csv('0,1000,7,5,Off,1\n1,2000,8,20,On,2\n2,3000,9,20,Off,3','psi');
  const side=async(text,name)=>{const f=await inspectMeasuredFile(Buffer.from(text),name);return {...summarizeMeasuredFile(f,{start:0,end:2}),tune:null};};
  const state=blankCase();state.format='DD84_TROUBLESHOOTING_CASE_V2';state.context.vehicle='Synthetic channel view';
  state.measuredReview=normalizeMeasuredReview({format:'DD84_MEASURED_REVIEW_V1',learningReady:false,automaticApplication:false,writeStrategy:'SIMULATION_ONLY',before:await side(before,'earlier.csv'),after:await side(after,'later.csv'),outcome:{result:'unassessed',changeReason:'',changes:'',conditions:'',criterion:'',observation:'',nextAction:'',reviewer:''}});
  const saved=caseReport(state);
  for(const mode of ['studio','web']){
    const page=await browser.newPage({viewport:mode==='studio'?{width:1280,height:900}:{width:390,height:844}}),errors=[];let requests=0;
    page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/v1/**',route=>{requests++;return route.fulfill({status:401,json:{message:'Synthetic signed out'}});});
    await page.goto(origin+(mode==='studio'?'/studio/':'/troubleshoot'));if(mode==='studio')await page.locator('#workspace-navigation [data-page=troubleshoot]').click();
    await page.locator('#trouble-open').setInputFiles({name:'channels.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
    const explorer=page.getByRole('region',{name:'Measurement channel explorer',exact:true}),summary=explorer.getByRole('status',{name:'Channel view summary'}),table=explorer.getByRole('region',{name:'Filtered measurement channels',exact:true}),details=explorer.getByRole('region',{name:'Selected channel details',exact:true});
    const initialRequests=requests;
    await summary.filter({hasText:'7 of 7 channel entries shown. 3 comparable; 4 unpaired.'}).waitFor();
    await page.getByText('Earlier source, filters and complete channel inventory',{exact:true}).click();
    await page.getByLabel('Recheck earlier source CSV',{exact:true}).setInputFiles({name:'earlier.csv',mimeType:'text/csv',buffer:Buffer.from(before)});
    const verified=page.getByRole('status',{name:'Earlier source verification',exact:true});await verified.filter({hasText:'Source and saved statistics match'}).waitFor();
    assert.equal(await explorer.locator('img').count(),0);
    await explorer.getByLabel('Find a channel',{exact:true}).fill('spark');
    await summary.filter({hasText:'1 of 7'}).waitFor();assert.match(await table.textContent(),/1 \/ 3 \(33\.3%\)/);
    const inspect=table.getByRole('button',{name:'Inspect Spark [deg]',exact:true});await inspect.focus();await page.keyboard.press('Enter');
    assert.equal(await details.evaluate(n=>n===document.activeElement),true);
    assert.match(await details.textContent(),/Numeric: 1 · Missing: 1 · Nonnumeric: 1/);
    const stats=details.getByRole('region',{name:'Selected channel statistics',exact:true});
    assert.deepEqual(await stats.getByRole('row').filter({hasText:'Minimum'}).locator('td').allTextContents(),['Minimum','10','5','-5']);
    await explorer.getByLabel('Show channels',{exact:true}).selectOption('increased');await summary.filter({hasText:'1 of 7'}).waitFor();
    await explorer.getByLabel('Statistic to compare',{exact:true}).selectOption('min');await summary.filter({hasText:'0 of 7'}).waitFor();assert.match(await details.textContent(),/Choose a channel/);
    await explorer.getByLabel('Show channels',{exact:true}).selectOption('decreased');await summary.filter({hasText:'1 of 7'}).waitFor();
    ok(mode+': channel search, numeric coverage, keyboard inspection and statistic-specific direction filters work');
    await explorer.getByRole('button',{name:'Reset channel view',exact:true}).click();
    await explorer.getByLabel('Show channels',{exact:true}).selectOption('unpaired');await summary.filter({hasText:'4 of 7'}).waitFor();
    await explorer.getByLabel('Exported units',{exact:true}).selectOption({label:'psi'});await summary.filter({hasText:'1 of 7'}).waitFor();
    await table.getByRole('button',{name:'Inspect MAP [psi] — later only',exact:true}).click();
    assert.match(await details.textContent(),/Unpaired:/);assert.match(await details.textContent(),/Earlier: no paired channel entry/);
    await explorer.getByRole('button',{name:'Reset channel view',exact:true}).click();
    await explorer.getByLabel('Show channels',{exact:true}).selectOption('incomplete');await summary.filter({hasText:'3 of 7'}).waitFor();
    await explorer.getByLabel('Find a channel',{exact:true}).fill('NO SUCH CHANNEL');await summary.filter({hasText:'0 of 7'}).waitFor();
    assert(await explorer.getByText('No channels match this view. Clear the search or reset the channel view.',{exact:true}).isVisible());
    assert.match(await verified.textContent(),/Source and saved statistics match/);
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save troubleshooting case',exact:true}).click();
    assert.deepEqual(JSON.parse(await fs.readFile(await(await download).path(),'utf8')),saved);
    await page.locator('#trouble-open').setInputFiles({name:'channels-again.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
    await summary.filter({hasText:'7 of 7'}).waitFor();assert.equal(await explorer.getByLabel('Find a channel',{exact:true}).inputValue(),'');
    assert.equal(requests,initialRequests);assert.deepEqual(errors,[]);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await explorer.getByLabel('Find a channel',{exact:true}).fill('Spark');
    await table.getByRole('button',{name:'Inspect Spark [deg]',exact:true}).click();
    await page.screenshot({path:path.join(output,mode+'-channel-details.png')});
    ok(mode+': unit-mismatched and text channels stay explicit; display filters preserve saved cases and reset on reopen without uploads');
    if(mode==='web'){
      const one=structuredClone(saved);one.measuredReview.after=null;
      await page.locator('#trouble-open').setInputFiles({name:'earlier-only.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(one))});
      await summary.filter({hasText:'5 of 5 channel entries shown. 0 comparable; 5 unpaired.'}).waitFor();
      await explorer.getByLabel('Show channels',{exact:true}).selectOption('changed');await summary.filter({hasText:'0 of 5'}).waitFor();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      ok('single-sided reviews cannot manufacture changed channels or overflow the mobile viewport');
    }
    await page.close();
  }
}
