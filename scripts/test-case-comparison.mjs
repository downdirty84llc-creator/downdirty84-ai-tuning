import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {caseReport} from '../products/dd84-desktop/troubleshooting.mjs';
import {prepareCaseComparison} from '../products/dd84-desktop/caseComparison.mjs';

export async function testCaseComparison({browser,origin,output,ok,measuredCase}){
  const reference=caseReport(measuredCase),current=structuredClone(reference);current.context.caseName='Synthetic follow-up';current.context.conditions='Different test conditions';current.measuredReview.outcome.observation='Follow-up operator statement';
  const expected=await prepareCaseComparison(reference,current),file=(value,name='reference.json')=>({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  for(const target of ['web','studio']){
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+(target==='web'?'/troubleshoot':'/studio/'));if(target==='studio')await page.locator('#workspace-navigation [data-page=troubleshoot]').click();
    await page.locator('#trouble-open').setInputFiles(file(current,'current.json'));await page.waitForFunction(()=>document.querySelector('#trouble-caseName')?.value==='Synthetic follow-up');
    const area=page.locator('.troubleshooting .case-comparison'),result=area.getByRole('region',{name:'Case revision comparison'});
    await area.getByText('Compare saved case revisions',{exact:true}).click();await area.getByLabel('Reference troubleshooting case JSON').setInputFiles(file(reference));await result.getByRole('heading',{name:/3 changed items/}).waitFor();
    await area.getByLabel('Search case changes').fill('observation');assert.equal(await result.locator('tbody tr').count(),1);
    const download=page.waitForEvent('download');await result.getByRole('button',{name:'Save case comparison',exact:true}).click();assert.deepEqual(JSON.parse(await fs.readFile(await(await download).path(),'utf8')),expected);
    assert.equal(await page.locator('#trouble-caseName').inputValue(),current.context.caseName);
    await page.locator('#trouble-conditions').fill('Newer edit');assert(await result.isHidden());await area.getByRole('button',{name:'Compare with current case',exact:true}).click();await result.waitFor();assert.match(await result.textContent(),/Newer edit/);
    await page.getByLabel('What did you observe, and what supports it?',{exact:true}).fill('Pending measured note');assert(await result.isHidden());await area.getByRole('button',{name:'Compare with current case',exact:true}).click();await area.getByRole('status').filter({hasText:'Update outcome notes'}).waitFor();assert(await result.isHidden());
    await page.getByRole('button',{name:'Update outcome notes',exact:true}).click();await area.getByRole('button',{name:'Compare with current case',exact:true}).click();await result.waitFor();
    await area.getByLabel('Reference troubleshooting case JSON').setInputFiles(file({format:'unknown'}));await area.getByRole('status').filter({hasText:'Could not read reference'}).waitFor();assert(await result.isHidden());assert.equal(await page.locator('#trouble-caseName').inputValue(),current.context.caseName);
    await area.getByLabel('Reference troubleshooting case JSON').setInputFiles(file(reference));await result.waitFor();await area.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`case-comparison-${target}-mobile.png`)});await result.locator('table').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`case-comparison-${target}-table.png`)});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.deepEqual(errors,[]);ok(`${target}: full comparison export, local editing, pending-measurement gate, invalid-reference preservation and mobile layout`);await page.close();
  }
  const page=await browser.newPage();await page.goto(origin+'/studio/');
  await page.evaluate(async current=>{const {mountCaseComparison}=await import('/studio/caseComparisonUI.mjs');document.body.replaceChildren();const root=document.createElement('div');document.body.append(root);window.compareCurrent=current;window.saveStatus='failed';window.comparison=mountCaseComparison(root,()=>window.compareCurrent,{save:async value=>{window.savedComparison=value;return {status:window.saveStatus};}});},current);
  const changed=structuredClone(reference);for(const side of ['before','after'])if(changed.measuredReview[side])changed.measuredReview[side].source.sha256='f'.repeat(64);
  await page.evaluate(async value=>window.comparison.setReference(value,'Changed CSV fixture'),changed);const result=page.getByRole('region',{name:'Case revision comparison'});await result.waitFor();assert.equal(await result.locator('tbody tr').count(),50);await result.getByRole('button',{name:'Next changes',exact:true}).click();assert.match(await result.textContent(),/Showing 51/);
  await result.getByRole('button',{name:'Save case comparison',exact:true}).click();await page.getByRole('status').filter({hasText:'not saved'}).waitFor();await page.evaluate(()=>window.saveStatus='canceled');await result.getByRole('button',{name:'Save case comparison',exact:true}).click();await page.getByRole('status').filter({hasText:'save canceled'}).waitFor();await page.evaluate(()=>window.saveStatus='saved');await result.getByRole('button',{name:'Save case comparison',exact:true}).click();await page.getByRole('status').filter({hasText:'Comparison saved.'}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.savedComparison),await prepareCaseComparison(changed,current));ok('changed-source inventory is paginated without truncating exports; failed and canceled saves never report success');
  await page.evaluate(()=>{const original=File.prototype.text;File.prototype.text=async function(){if(this.name==='delayed.json')await new Promise(resolve=>window.finishComparisonRead=resolve);return original.call(this);};});
  await page.getByLabel('Reference troubleshooting case JSON').setInputFiles(file(reference,'delayed.json'));await page.waitForFunction(()=>typeof window.finishComparisonRead==='function');await page.getByRole('button',{name:'Clear comparison',exact:true}).click();await page.evaluate(()=>window.finishComparisonRead());await page.waitForTimeout(50);assert(await result.isHidden());assert(await page.getByRole('button',{name:'Compare with current case',exact:true}).isDisabled());ok('clearing a comparison invalidates delayed reference reads');await page.close();
}
