import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {blankCase,caseReport} from '../products/dd84-desktop/troubleshooting.mjs';
import {prepareCasePrint} from '../products/dd84-desktop/casePrint.mjs';

export async function testCasePrint({browser,origin,output,ok,measuredCase}){
  const state=structuredClone(measuredCase);state.context.caseName='Synthetic printable handoff';state.context.vehicle='<img src=x onerror=alert(1)> Synthetic vehicle';state.checks['fuel-reference']={status:'issue',note:'Retained from another issue'};
  const saved=caseReport(state),model=await prepareCasePrint(saved);
  for(const mode of ['studio','web']){
    const page=await browser.newPage({viewport:mode==='studio'?{width:1280,height:900}:{width:390,height:844}}),errors=[];let writes=0;
    page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/v1/**',route=>{if(!['GET','HEAD','OPTIONS'].includes(route.request().method()))writes++;return route.fulfill({status:401,json:{message:'Synthetic signed out'}});});
    await page.addInitScript(()=>{window.__printCalls=0;window.print=()=>window.__printCalls++;});
    await page.goto(origin+(mode==='studio'?'/studio/':'/troubleshoot'));if(mode==='studio')await page.locator('#workspace-navigation [data-page=troubleshoot]').click();
    await page.locator('#trouble-open').setInputFiles({name:'print-case.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
    const open=page.getByRole('button',{name:'Preview printable case report',exact:true});await open.click();
    const preview=page.getByRole('dialog',{name:'DD84 case report preview',exact:true}),article=preview.locator('article');await preview.waitFor();
    assert.match(await article.textContent(),/Synthetic printable handoff/);assert.match(await article.textContent(),/Retained from another issue/);assert((await article.textContent()).includes(model.sha256));
    assert.equal(await article.locator('img').count(),1);await article.locator('img').evaluate(img=>img.decode());
    assert.equal(await article.locator('.case-print-channel').first().evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)');
    const channels=saved.measuredReview.before.channels.length+(saved.measuredReview.after?.channels.length??0);
    assert.equal(await article.locator('.case-print-channel p').filter({hasText:/^(Earlier|Later) ID /}).count(),channels);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await preview.evaluate(n=>n.scrollWidth<=n.clientWidth+1));
    await page.screenshot({path:path.join(output,mode+'-print-preview.png')});
    await preview.getByRole('button',{name:'Print / Save as PDF',exact:true}).click();assert.equal(await page.evaluate(()=>window.__printCalls),1);assert.match(await preview.getByRole('status').textContent(),/cannot verify/);
    await page.emulateMedia({media:'print'});
    assert.equal(await preview.locator('.case-print-tools').isVisible(),false);
    assert.equal(await open.isVisible(),false);assert(await article.isVisible());
    assert.equal(await preview.evaluate(n=>getComputedStyle(n).maxHeight),'none');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'light');
    await page.pdf({path:path.join(output,mode+'-case-report.pdf'),format:'Letter',printBackground:true});
    await page.emulateMedia({media:'screen'});
    await preview.getByRole('checkbox',{name:'Include full channel tables',exact:true}).uncheck();
    assert.equal(await article.locator('table').count(),0);assert.match(await article.textContent(),/Channel measurements omitted/);assert((await article.textContent()).includes(model.sha256));
    await page.keyboard.press('Escape');assert.equal(await preview.count(),0);assert.equal(await open.evaluate(n=>document.activeElement===n),true);
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save troubleshooting case',exact:true}).click();assert.deepEqual(JSON.parse(await fs.readFile(await(await download).path(),'utf8')),saved);
    ok(mode+': branded printable snapshot includes every source channel and retained check, isolates printed content, restores focus and preserves the full saved case');
    await page.getByLabel('What did you observe, and what supports it?',{exact:true}).fill('Pending uncommitted notes');await open.click();assert.equal(await preview.count(),0);assert.match(await page.locator('.troubleshooting').textContent(),/before previewing/);
    await page.getByRole('button',{name:'Discard pending measured changes',exact:true}).click();await open.click();await preview.waitFor();assert(!(await article.textContent()).includes('Pending uncommitted notes'));await preview.getByRole('button',{name:'Close preview',exact:true}).click();
    const v1=blankCase();await page.locator('#trouble-open').setInputFiles({name:'v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(v1))});
    const replace=page.getByRole('button',{name:'Replace current case',exact:true});await replace.waitFor();await replace.click();
    await open.click();await preview.waitFor();assert.match(await article.textContent(),/No measured review attached/);assert.equal(await preview.getByRole('checkbox').count(),0);await preview.getByRole('button',{name:'Close preview',exact:true}).click();
    assert.equal(writes,0);assert.deepEqual(errors,[]);
    ok(mode+': pending measurement edits cannot print a stale review; V1 cases remain printable without inventing measurements or uploading data');
    await page.close();
  }
}
