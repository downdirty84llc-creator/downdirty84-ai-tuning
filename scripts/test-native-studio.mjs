// Windows packaged-app acceptance using synthetic data in a unique profile.
// Native file persistence is real; only destination selection is controlled.
// This is not a manual system-dialog or clean-machine installation test.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {_electron} from 'playwright';
import {sample,edit,review} from '../products/dd84-desktop/project.mjs';
import {testNativeCases} from './test-native-cases.mjs';
import {testNativeWorkflows} from './test-native-workflows.mjs';
assert.equal(process.platform,'win32','Packaged GUI acceptance requires Windows');
assert(process.argv[2],'Supply the packaged DD84 executable path');
const exe=path.resolve(process.argv[2]),asar=path.join(path.dirname(exe),'resources/app.asar');
const output=await fs.mkdtemp(path.join(process.env.DD84_NATIVE_OUTPUT||os.tmpdir(),'dd84-native-'));
const profile=path.join(output,'profile');await fs.mkdir(profile);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),asarHash=hash(await fs.readFile(asar));
const env={...process.env,PATH:path.join(process.env.SystemRoot,'System32')};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;delete env.NODE_PATH;
let app,page,mainPid;const errors=[];
async function launch(){
  app=await _electron.launch({executablePath:exe,args:['--user-data-dir='+profile],env,timeout:30000});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  mainPid=await app.evaluate(()=>process.pid);
  const paths=await app.evaluate(({app,BrowserWindow})=>({userData:app.getPath('userData'),storage:BrowserWindow.getAllWindows()[0].webContents.session.getStoragePath()}));
  assert.equal(path.resolve(paths.userData).toLowerCase(),profile.toLowerCase());assert.equal(path.resolve(paths.storage).toLowerCase(),profile.toLowerCase());
  await page.locator('#project-recovery').waitFor();
}
async function recovery(){return page.evaluate(()=>window.dd84Recovery.read());}
async function waitCopy(note){const until=Date.now()+5000;while(Date.now()<until){const r=await recovery();if(r?.snapshot?.note===note)return r;await page.waitForTimeout(40);}throw Error('Native recovery copy did not complete.');}
async function saveTo(filename,button){
  await app.evaluate(({dialog},filename)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:filename});},filename);
  await button.click();await page.locator('#message').filter({hasText:`Saved ${path.basename(filename)}.`}).waitFor();return JSON.parse(await fs.readFile(filename,'utf8'));
}
const expected={project:edit(sample(),'Airflow.MAF.Curve',0,12),note:'Synthetic native recovery review; no vehicle data.'};
try{
  await launch();const version=await app.evaluate(({app})=>app.getVersion());assert.match(version,/^\d+\.\d+\.\d+$/);
  await promisify(execFile)(exe,['--user-data-dir='+profile],{env,windowsHide:true,timeout:15000});assert.equal(await app.evaluate(()=>process.pid),mainPid);
  await page.locator('#nav-open').click();await page.locator('#new').click();const cell=page.locator('#parameter-table input[type=number]').first();await cell.fill('12');await cell.press('Tab');await page.locator('#note').fill(expected.note);
  await page.locator('#project-recovery summary').click();await page.getByRole('button',{name:'Enable local project recovery',exact:true}).click();assert.deepEqual((await waitCopy(expected.note)).snapshot,expected);
  expected.note='Updated synthetic native recovery review; no vehicle data.';await page.locator('#note').fill(expected.note);assert.deepEqual((await waitCopy(expected.note)).snapshot,expected);
  // Exit the process without asking the renderer to save or run beforeunload.
  // Electron's Windows launcher can be a different process from its main
  // process. Terminate this test's main process and children, not just the launcher.
  await promisify(execFile)(path.join(process.env.SystemRoot,'System32/taskkill.exe'),['/PID',String(mainPid),'/T','/F'],{windowsHide:true});app=null;
  await launch();const recovered=await recovery();assert.deepEqual(recovered?.snapshot,expected,'Recovery contents did not survive process exit.');await page.getByRole('button',{name:'Restore recovered project',exact:true}).waitFor();assert(await page.locator('#workspace').isHidden());await page.getByRole('button',{name:'Restore recovered project',exact:true}).click();await page.locator('#project-recovery [role=status]').filter({hasText:'Project restored as unsaved'}).waitFor();
  assert.equal(await page.locator('#note').inputValue(),expected.note);assert.equal(await page.locator('#parameter-table input[type=number]').first().inputValue(),'12');assert(await page.locator('#undo').isDisabled());
  const projectFile=path.join(output,'native-project.json'),reviewFile=path.join(output,'native-review.json');
  assert.deepEqual(await saveTo(projectFile,page.locator('#save')),expected.project);assert.match(await page.locator('#identity').textContent(),/Unsaved/);
  const reviewStarted=Date.now(),savedReview=await saveTo(reviewFile,page.locator('#export')),expectedReview=await review(expected.project,expected.note);
  assert(Date.parse(savedReview.createdAt)>=reviewStarted&&Date.parse(savedReview.createdAt)<=Date.now());expectedReview.createdAt=savedReview.createdAt;assert.deepEqual(savedReview,expectedReview);await page.locator('#identity').filter({hasText:'Project loaded / saved'}).waitFor();
  await page.locator('#open').setInputFiles(projectFile);await page.waitForFunction(()=>document.querySelector('#note')?.value==='');const second=path.join(output,'native-project-resaved.json');assert.deepEqual(await saveTo(second,page.locator('#save')),expected.project);assert.equal(hash(await fs.readFile(second)),hash(await fs.readFile(projectFile)));
  const measuredCases=await testNativeCases({app,page,output,saveTo});
  const workflows=await testNativeWorkflows({app,page,output,saveTo});
  const display=await app.evaluate(({screen})=>{const d=screen.getPrimaryDisplay();return {scaleFactor:d.scaleFactor,bounds:d.bounds,workArea:d.workArea};});
  await page.locator('#nav-open').click();
  const zoomResults=[];for(const zoom of [100,125,150,200]){await page.locator('#view-size').selectOption(String(zoom));const actual=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getZoomFactor());assert.equal(actual,zoom/100);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));zoomResults.push(zoom);}
  await page.locator('#view-size').selectOption('100');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(700,550));await page.locator('#nav-open').focus();await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.activeElement?.tagName==='BUTTON'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,'native-minimum-window.png')});
  assert.deepEqual(errors,[]);assert.equal(hash(await fs.readFile(asar)),asarHash);
  const proof={version,checkedAt:new Date().toISOString(),windows:os.release(),asarSha256:asarHash,profileIsolated:true,singleInstanceEnforced:true,systemNodeRemovedFromPath:true,incrementalRecoveryUpdated:true,abruptExitAndRestorePassed:true,completeProjectAndReviewSaved:true,projectResaveByteIdentical:true,originalValuesPreserved:true,nativeDestinationSelectionControlled:true,zoomResults,minimumWindow:[700,550],pageErrors:errors,hardwareAccessed:false,customerFilesAccessed:false,cleanMachineAcceptance:false,manualSystemDialogAcceptance:false};
  proof.measuredCases=measuredCases;
  proof.workflows=workflows;proof.currentPrimaryDisplay=display;
  await fs.writeFile(path.join(output,'native-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({output,...proof}));
}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}}
