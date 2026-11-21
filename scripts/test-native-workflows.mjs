// Exact packaged-app workflows with synthetic sources. Only native save
// destination selection is controlled; complete disk contents are verified.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeCase} from '../products/dd84-desktop/filePair.mjs';
import {logReport} from '../products/dd84-desktop/logs.mjs';
import {segmentReport} from '../products/dd84-desktop/segment.mjs';
import {differenceReport} from '../products/dd84-desktop/differences.mjs';
import {makeLearningCase} from '../products/dd84-desktop/learning.mjs';
import {importRealExport} from '../products/dd84-desktop/realImport.mjs';
import {edit} from '../products/dd84-desktop/project.mjs';
import {makeBenchPlan,rehearsalBytes,reviewBenchCapture} from '../products/dd84-desktop/bench.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');

export async function testNativeWorkflows({app,page,output,saveTo}){
  const files=[];
  async function fixture(name,text){const file=path.join(output,name);await fs.writeFile(file,text,{flag:'wx'});return file;}
  async function saved(name,button,expected){const filename=path.join(output,name),value=await saveTo(filename,page.locator(button));assert.deepEqual(value,expected,'Full saved contents: '+name);files.push({name,sha256:hash(await fs.readFile(filename))});return filename;}
  const goto=async name=>page.locator(`#workspace-navigation [data-page=${name}]`).click();
  const accept=()=>page.once('dialog',dialog=>dialog.accept());
  const originalText='HPT SYNTHETIC ORIGINAL ONLY',finalText='HPT SYNTHETIC FINAL ONLY';
  const originalFile=await fixture('synthetic-original.hpt',originalText),finalFile=await fixture('synthetic-final.hpt',finalText);
  const identity=(name,text)=>({name,bytes:Buffer.byteLength(text),sha256:hash(text)});
  const original=identity(path.basename(originalFile),originalText),final=identity(path.basename(finalFile),finalText);
  const pair=makeCase('Synthetic Windows acceptance','No customer or vehicle data',original,final);
  await goto('comparisons');await page.locator('#pair-vehicle').fill(pair.vehicle);await page.locator('#pair-build').fill(pair.build);
  await page.locator('#original-file').setInputFiles(originalFile);await page.locator('#final-file').setInputFiles(finalFile);
  await page.locator('#pair-save:enabled').waitFor();
  const pairFile=await saved('native-workflow-pair.json','#pair-save',pair);
  accept();await page.locator('#pair-open').setInputFiles(pairFile);await page.locator('#pair-status').filter({hasText:'Case opened'}).waitFor();assert(await page.locator('#pair-save').isDisabled());
  await page.locator('#original-file').setInputFiles(originalFile);await page.locator('#final-file').setInputFiles(finalFile);await page.locator('#pair-save:enabled').waitFor();
  await saved('native-workflow-pair-reopened.json','#pair-save',pair);
  const differences='"Synthetic table","Synthetic description"\n"deg","0","0","rpm"\n"0","2","0"\n"0","-3","1"\n"load"\n';
  const diffFile=await fixture('synthetic-differences.csv',differences),directionEvidence='Synthetic scalar values checked in both fixtures';
  await page.locator('#diff-pair').setInputFiles(pairFile);await page.locator('#diff-open').setInputFiles(diffFile);await page.locator('#diff-save:enabled').waitFor();
  await page.locator('#diff-direction').selectOption('BEFORE_MINUS_AFTER');await page.locator('#diff-evidence').fill(directionEvidence);
  const diff=await differenceReport(differences,path.basename(diffFile),pair,'BEFORE_MINUS_AFTER',directionEvidence);
  await saved('native-workflow-differences.json','#diff-save',diff);assert.equal(diff.automaticApplication,false);

  const csv='HP Tuners CSV Log File\nVersion: 1.0\n[Channel Information]\n0,1,2\nOffset,Engine RPM,Spark\ns,rpm,deg\n[Channel Data]\n0,1000,10\n1,2000,\n2,3000,20\n';
  const csvFile=await fixture('synthetic-workflow.csv',csv),selection=[{role:'RPM',channelId:'1',evidence:'Synthetic channel definition'}],association='Synthetic tune association; not a vehicle claim';
  await goto('logs');await page.locator('#log-open').setInputFiles(csvFile);await page.locator('#log-save:enabled').waitFor();
  await page.getByText('Choose channels for review',{exact:true}).click();
  await page.locator('#log-tune').fill(original.sha256);await page.locator('#log-association').fill(association);await page.locator('#map-RPM').selectOption('1');await page.locator('#evidence-RPM').fill(selection[0].evidence);
  const log=await logReport(csv,path.basename(csvFile),original.sha256,association,selection);
  const logFile=await saved('native-workflow-log.json','#log-save',log);
  accept();await page.locator('#log-review-open').setInputFiles(logFile);await page.locator('#log-status').filter({hasText:'Saved review restored'}).waitFor();
  await saved('native-workflow-log-reopened.json','#log-save',log);
  await page.locator('#log-trace-channel').selectOption('2');await page.locator('#log-trace-start').fill('0');await page.locator('#log-trace-end').fill('1');await page.locator('#log-trace-apply').click();await page.locator('#log-segment-note').fill('Synthetic missing-value segment');
  const segment=await segmentReport(csv,path.basename(csvFile),'2',{start:0,end:1},'Synthetic missing-value segment');
  const segmentFile=await saved('native-workflow-segment.json','#log-segment-save',segment);
  accept();await page.locator('#log-segment-open').setInputFiles(segmentFile);await page.locator('#log-status').filter({hasText:'restored'}).waitFor();
  await saved('native-workflow-segment-reopened.json','#log-segment-save',segment);
  const wrongCsv=await fixture('synthetic-wrong.csv',csv.replace('1000','1001'));
  await page.locator('#log-open').setInputFiles(wrongCsv);await page.locator('#log-save:enabled').waitFor();accept();await page.locator('#log-review-open').setInputFiles(logFile);await page.locator('#log-status').filter({hasText:/does not match/}).waitFor();
  assert.equal(await page.locator('#log-tune').inputValue(),'');

  await goto('learning');const learning=makeLearningCase({vehicle:'Synthetic learning evidence',displacementLiters:5.3,camNotes:'Unknown synthetic cam',buildNotes:'No learning or performance claims',files:[{role:'ORIGINAL',...original,tuneSha256:null},{role:'FINAL',...final,tuneSha256:null}],measurements:[]});
  await page.locator('#learning-vehicle').fill(learning.vehicle);await page.locator('#learning-displacement').fill('5.3');await page.locator('#learning-cam').fill(learning.camNotes);await page.locator('#learning-build').fill(learning.buildNotes);
  await page.locator('#learning-role').selectOption('ORIGINAL');await page.locator('#learning-file').setInputFiles(originalFile);await page.locator('#learning-files').filter({hasText:original.sha256}).waitFor();
  await page.locator('#learning-role').selectOption('FINAL');await page.locator('#learning-file').setInputFiles(finalFile);await page.locator('#learning-files').filter({hasText:final.sha256}).waitFor();
  const learningFile=await saved('native-workflow-learning.json','#learning-save',learning);
  accept();await page.locator('#learning-open').setInputFiles(learningFile);await page.locator('#learning-status').filter({hasText:'Case opened'}).waitFor();
  await saved('native-workflow-learning-reopened.json','#learning-save',learning);
  await page.locator('#learning-check').click();await page.locator('#learning-status').filter({hasText:'Learning remains blocked'}).waitFor();

  // Readable exported values, not a claim of native HPT decoding or writing.
  const readable={format:'DD84_SIERRA_ABSOLUTE_MAF_V1',tables:[12160,12159].map(id=>{const unit=id===12160?'g/s':'lb/h';return {id,name:'Synthetic MAF '+id,unit,final:{source:{path:originalFile,sha256:original.sha256},frequencyHz:[0,150,300],airflow:[0,0.3,0.6],airflowUnit:unit}};})};
  const readableText=JSON.stringify(readable),readableFile=await fixture('synthetic-parameters.json',readableText);
  await goto('projects');await page.locator('#real-import-stage').selectOption('final');await page.locator('#real-import').setInputFiles(readableFile);await page.locator('#message').filter({hasText:'Readable tables imported'}).waitFor();
  const imported=await importRealExport(readableText,path.basename(readableFile),'final'),edited=edit(imported,imported.parameters[0].path,0,0.1);
  await page.locator('#parameter-list').selectOption(imported.parameters[0].path);const cell=page.locator('#parameter-table input[type=number]').first();await cell.fill('0.1');await cell.press('Tab');
  const draftFile=await saved('native-workflow-draft.json','#save',edited);await page.locator('#open').setInputFiles(draftFile);await page.locator('#message').filter({hasText:'Opened native-workflow-draft.json'}).waitFor();
  await saved('native-workflow-draft-reopened.json','#save',edited);assert.equal(edited.parameters[0].original[0],0);
  const holleyText=JSON.stringify({format:'DD84_CANDIDATE_RAW_SPARK_EXTRACTION_V1',tables:{base:{source:{path:'C:/synthetic.terx',sha256:'c'.repeat(64)},rpm:[500,1000],map:[0,100],valuesByAscendingMap:[[1,2],[3,4]]}}});
  const holleyFile=await fixture('synthetic-holley-candidate.json',holleyText),holley=await importRealExport(holleyText,path.basename(holleyFile),'base');
  await page.locator('#real-import-stage').selectOption('base');await page.locator('#real-import').setInputFiles(holleyFile);await page.locator('#real-source-details').filter({hasText:'synthetic.terx'}).waitFor();
  assert.equal(await page.locator('#parameter-table input:enabled').count(),0);await saved('native-workflow-holley-readonly.json','#save',holley);

  await goto('device');const plan=makeBenchPlan('01020304',8),planFile=await fixture('synthetic-plan.json',JSON.stringify(plan));
  await page.locator('#bench-plan-open').setInputFiles(planFile);await page.locator('#bench-rehearse:enabled').waitFor();await saved('native-workflow-plan.json','#bench-plan-save',plan);
  await page.locator('#bench-rehearse').click();await page.locator('#bench-report-save:enabled').waitFor();
  const bench=await reviewBenchCapture({plan,session:'1',bytes:rehearsalBytes(plan,'1'),filename:'software-rehearsal.bin',source:'SOFTWARE_REHEARSAL'});
  await saved('native-workflow-bench.json','#bench-report-save',bench);assert.equal(bench.source,'SOFTWARE_REHEARSAL');assert.equal(bench.comparison.comparisonPassed,true);
  assert.equal(hash(await fs.readFile(originalFile)),original.sha256);assert.equal(hash(await fs.readFile(finalFile)),final.sha256);assert.equal(await fs.readFile(csvFile,'utf8'),csv);
  return {filePairSaveReverify:true,detailedComparisonExport:true,fullLogSaveReopen:true,segmentSaveReopen:true,wrongCsvRejected:true,learningCaseSaveReopen:true,readableDraftEditSaveReopen:true,holleyUnverifiedRemainsReadonly:true,softwareBenchRehearsal:true,originalSourcesUnchanged:true,files};
}
