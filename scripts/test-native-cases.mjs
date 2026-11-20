// Packaged Electron acceptance. Only native save destination selection is
// controlled; parsing, renderer events, preload IPC and disk writes are real.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {blankCase,caseReport} from '../products/dd84-desktop/troubleshooting.mjs';
import {inspectMeasuredFile,summarizeMeasuredFile} from '../products/dd84-desktop/measuredCsv.mjs';
import {normalizeMeasuredReview} from '../products/dd84-desktop/measuredReview.mjs';
import {prepareCaseComparison} from '../products/dd84-desktop/caseComparison.mjs';

export async function testNativeCases({app,page,output,saveTo}) {
  const csv=rows=>'HP Tuners CSV Log File\nVersion: 1.0\n[Channel Information]\n0,1,2,3\nOffset,RPM,MAP,Spark\ns,rpm,kPa,deg\n[Channel Data]\n'+rows;
  const earlier=csv('0,1000,50,10\n1,2000,60,20\n2,3000,70,30'),later=csv('0,1000,50,12\n1,2000,60,16\n2,3000,70,32');
  const file=(name,text)=>({name,mimeType:'text/csv',buffer:Buffer.from(text)});
  async function summary(text,name) {
    const loaded=await inspectMeasuredFile(Buffer.from(text),name);
    return {...summarizeMeasuredFile(loaded,{start:0,end:2,filters:[{channelId:'1',min:1000,max:2000}]}),tune:null};
  }
  const expected=blankCase();
  expected.context.caseName='Synthetic packaged Windows case';
  expected.context.vehicle='Synthetic vehicle; no real calibration';
  expected.format='DD84_TROUBLESHOOTING_CASE_V2';
  expected.measuredReview=normalizeMeasuredReview({
    format:'DD84_MEASURED_REVIEW_V1',writeStrategy:'SIMULATION_ONLY',learningReady:false,automaticApplication:false,
    before:await summary(earlier,'earlier.csv'),after:await summary(later,'later.csv'),
    outcome:{result:'inconclusive',changeReason:'',changes:'',conditions:'',criterion:'',
      observation:'Initial synthetic observation; no vehicle tested.',nextAction:'',reviewer:''}
  });
  await page.locator('#workspace-navigation [data-page=troubleshoot]').click();
  await page.locator('#trouble-caseName').fill(expected.context.caseName);
  await page.locator('#trouble-vehicle').fill(expected.context.vehicle);
  await page.getByText('3. Compare measured differences and record the outcome',{exact:true}).click();
  const panel=page.locator('section.measured-review'),save=page.getByRole('button',{name:'Save troubleshooting case',exact:true});
  for(const [label,text,name] of [['Earlier',earlier,'earlier.csv'],['Later',later,'later.csv']]) {
    await page.getByLabel(label+' CSV',{exact:true}).setInputFiles(file(name,text));
    await panel.getByRole('status').filter({hasText:'Recording loaded locally'}).waitFor();
    await page.getByLabel(label+' filter 1',{exact:true}).selectOption('1');
    await page.getByLabel(label+' filter 1 minimum',{exact:true}).fill('1000');
    await page.getByLabel(label+' filter 1 maximum',{exact:true}).fill('2000');
  }
  await page.getByLabel('Reported outcome',{exact:true}).selectOption('inconclusive');
  const note=page.getByLabel('What did you observe, and what supports it?',{exact:true});
  await note.fill(expected.measuredReview.outcome.observation);
  // Pending edits must not reach native save or silently omit measurements.
  await app.evaluate(({dialog})=>{globalThis.dd84CaseSaveCalls=0;dialog.showSaveDialog=async()=>{globalThis.dd84CaseSaveCalls++;return {canceled:true};};});
  await save.click();await page.getByRole('status').filter({hasText:'Build and attach the measured review or discard'}).waitFor();
  assert.equal(await app.evaluate(()=>globalThis.dd84CaseSaveCalls),0);
  await page.getByRole('button',{name:'Build and attach measured review',exact:true}).click();
  await panel.getByRole('status').filter({hasText:'Measured review attached locally'}).waitFor();
  await save.click();await page.locator('#message').filter({hasText:'Save canceled'}).waitFor();
  assert.equal(await app.evaluate(()=>globalThis.dd84CaseSaveCalls),1);
  const reference=caseReport(expected),referencePath=path.join(output,'native-case-reference.json');
  assert.deepEqual(await saveTo(referencePath,save),reference);
  const measured=reference.measuredReview;
  assert.equal(measured.before.rows,2);assert.equal(measured.after.rows,2);assert.equal(measured.before.outsideFilterRows,1);
  assert.equal(measured.comparisons.find(c=>c.name==='Spark').delta.mean,-1);
  assert.equal(measured.learningReady,false);assert.equal(measured.automaticApplication,false);

  await page.locator('#trouble-open').setInputFiles(referencePath);
  await panel.getByRole('status').filter({hasText:'Saved measurement summary restored'}).waitFor();
  const earlierDetails=panel.locator('details').filter({has:page.getByText('Earlier source, filters and complete channel inventory',{exact:true})});
  await earlierDetails.locator('summary').click();
  const recheck=page.getByLabel('Recheck earlier source CSV',{exact:true});
  const verification=page.getByRole('status',{name:'Earlier source verification',exact:true});
  await recheck.setInputFiles(file('renamed-earlier.csv',earlier));
  await verification.filter({hasText:'Source and saved statistics match'}).waitFor();
  assert.match(await verification.textContent(),/filename differs/);
  await recheck.setInputFiles(file('different-earlier.csv',earlier.replace('60,20','60,21')));
  await verification.filter({hasText:'Different CSV selected'}).waitFor();
  assert.doesNotMatch(await verification.textContent(),/Source and saved statistics match/);
  expected.measuredReview.outcome.observation='Packaged Windows follow-up; synthetic evidence only.';
  await note.fill(expected.measuredReview.outcome.observation);
  await page.getByRole('button',{name:'Update outcome notes',exact:true}).click();
  await panel.getByRole('status').filter({hasText:'Outcome notes updated locally'}).waitFor();
  const current=caseReport(expected),currentPath=path.join(output,'native-case-current.json');
  assert.deepEqual(await saveTo(currentPath,save),current);
  for(const key of ['before','after','comparisons','unmatched'])assert.deepEqual(current.measuredReview[key],measured[key]);

  const comparison=page.locator('.troubleshooting .case-comparison');
  await comparison.getByText('Compare saved case revisions',{exact:true}).click();
  await comparison.getByLabel('Reference troubleshooting case JSON').setInputFiles(referencePath);
  const result=comparison.getByRole('region',{name:'Case revision comparison'});
  await result.getByRole('heading',{name:/1 changed items/}).waitFor();
  const comparisonPath=path.join(output,'native-case-comparison.json');
  const savedComparison=await saveTo(comparisonPath,result.getByRole('button',{name:'Save case comparison',exact:true}));
  assert.deepEqual(savedComparison,await prepareCaseComparison(reference,current));assert.equal(savedComparison.changes.length,1);
  await result.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'native-case-comparison.png')});
  // Invalid reference must hide the previous result without replacing work.
  await comparison.getByLabel('Reference troubleshooting case JSON').setInputFiles(file('invalid.json','{"format":"unsupported"}'));
  await comparison.getByRole('status').filter({hasText:'Could not read reference'}).waitFor();
  assert(await result.isHidden());assert.equal(await note.inputValue(),expected.measuredReview.outcome.observation);
  await page.locator('#trouble-open').setInputFiles(currentPath);
  await panel.getByRole('status').filter({hasText:'Saved measurement summary restored'}).waitFor();
  assert.equal(await note.inputValue(),expected.measuredReview.outcome.observation);
  const reopenedPath=path.join(output,'native-case-reopened.json');
  assert.deepEqual(await saveTo(reopenedPath,save),current);
  assert.deepEqual(await fs.readFile(reopenedPath),await fs.readFile(currentPath));
  const files=[];
  for(const filename of [referencePath,currentPath,comparisonPath,reopenedPath]) {
    const bytes=await fs.readFile(filename);files.push({name:path.basename(filename),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  return {csvImportAndFilters:true,pendingSaveBlocked:true,canceledSaveRetainedWork:true,
    renamedSourceMatched:true,wrongSourceClearedSuccess:true,noteOnlyEditPreservedMeasurements:true,
    completeCaseAndComparisonSaved:true,invalidReferencePreservedCase:true,reopenedCaseByteIdentical:true,files};
}
