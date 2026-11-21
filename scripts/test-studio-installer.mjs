// Actual per-user installation into an isolated directory. Refuse to touch a
// pre-existing Studio registration/shortcut. No customer data or hardware.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {_electron} from 'playwright';
import {inventory} from '../tools/studio-installer/build.mjs';
import {createVerifier} from '../tools/studio-installer/signing.mjs';
const exec=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(process.platform,'win32');assert(process.argv[2],'Supply distribution-manifest.json');
const manifestPath=path.resolve(process.argv[2]),dist=path.dirname(manifestPath),manifest=JSON.parse(await fs.readFile(manifestPath));
const artifact=manifest.artifacts.find(x=>x.name.endsWith('-Setup.exe'));assert(artifact);
const setup=path.join(dist,artifact.name);assert.equal(hash(await fs.readFile(setup)),artifact.sha256);
let signatures=null;
if(manifest.unsignedPreview===false){
  assert(process.argv[3],'A signed distribution requires its separate owner signing config');
  signatures=await createVerifier(process.argv[3]);assert.equal(manifest.signing.publisher,signatures.publisher);await signatures.verify(setup);
}else assert.equal(manifest.unsignedPreview,true,'Manifest must declare its signing state');
const reg=path.join(process.env.SystemRoot,'System32/reg.exe');
const key='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\'+manifest.guid;
const locationKey='HKCU\\Software\\'+manifest.guid;
async function absentRegistry(key){try{await exec(reg,['query',key,'/reg:64'],{windowsHide:true});return false;}catch(e){if(e.code===1)return true;throw e;}}
for(const hive of ['HKCU','HKLM'])for(const k of [key,locationKey])assert(await absentRegistry(k.replace('HKCU',hive)),'Existing Studio installation: use a disposable Windows environment');
const shortcut=path.join(process.env.APPDATA,'Microsoft/Windows/Start Menu/Programs/DD84 Calibration Studio.lnk');
assert(!(await fs.stat(shortcut).catch(()=>null)),'Existing shortcut must not be replaced by acceptance');
const output=await fs.mkdtemp(path.join(process.env.DD84_INSTALLER_OUTPUT||os.tmpdir(),'dd84-installer-'));
const zip=manifest.artifacts.find(x=>x.name.endsWith('.zip'));assert(zip);
assert.equal(hash(await fs.readFile(path.join(dist,zip.name))),zip.sha256);
const extracted=path.join(output,'portable');
await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',
  '$ErrorActionPreference="Stop"; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:DD84_ACCEPTANCE_ZIP,$env:DD84_ACCEPTANCE_EXTRACT)'],
{windowsHide:true,timeout:120000,env:{...process.env,DD84_ACCEPTANCE_ZIP:path.join(dist,zip.name),DD84_ACCEPTANCE_EXTRACT:extracted}});
assert.deepEqual(await inventory(extracted),manifest.files,'Portable ZIP must contain exactly the same program files as the installer');
if(signatures)await signatures.verify(path.join(extracted,'DD84-Calibration-Studio.exe'));
const install=path.join(output,'app'),exe=path.join(install,'DD84-Calibration-Studio.exe');
// Every uninstall target is resolved and checked inside this exact test root.
function checkedInstall(){assert(path.resolve(install).startsWith(path.resolve(output)+path.sep));assert.notEqual(path.resolve(install),path.resolve(output));return install;}
const run=async(file,args)=>{try{const r=await exec(file,args,{windowsHide:true,timeout:120000});return {code:0,...r};}catch(e){if(typeof e.code==='number')return {code:e.code,stdout:e.stdout,stderr:e.stderr};throw e;}};
async function verifyInstalled(){for(const f of manifest.files)assert.equal(hash(await fs.readFile(path.join(install,f.name))),f.sha256,'Installed file mismatch: '+f.name);}
const saved='Synthetic saved work; preserve this during installation and removal.\n';
const sentinel=path.join(install,'My saved work','case.json'),outside=path.join(output,'outside-project.json');
let app,installed=false,uninstallCopy;
async function closeTestApp(){
  if(!app)return;
  const child=app.process();
  const exited=child.exitCode!==null?Promise.resolve():new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Synthetic Studio did not exit')),15000);
    child.once('exit',()=>{clearTimeout(timer);resolve();});
  });
  await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await exited;app=null;
}
async function uninstall(args=[]){checkedInstall();uninstallCopy??=path.join(output,'acceptance-uninstaller.exe');await fs.copyFile(path.join(install,'Uninstall DD84-Calibration-Studio.exe'),uninstallCopy);return run(uninstallCopy,['/S',...args,'_?='+install]);}
try {
  assert.equal((await run(setup,['/S','/D='+checkedInstall()])).code,0);installed=true;
  await verifyInstalled();assert(await fs.stat(shortcut));
  if(signatures){await signatures.verify(exe);await signatures.verify(path.join(install,'Uninstall DD84-Calibration-Studio.exe'));}
  const link=JSON.parse((await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',
    '$link=(New-Object -ComObject WScript.Shell).CreateShortcut($env:DD84_ACCEPTANCE_LINK); @{target=$link.TargetPath;icon=$link.IconLocation} | ConvertTo-Json -Compress'],
    {windowsHide:true,env:{...process.env,DD84_ACCEPTANCE_LINK:shortcut}})).stdout);
  assert.equal(path.resolve(link.target).toLowerCase(),path.resolve(exe).toLowerCase(),'Start menu shortcut must target the installed executable');
  assert.equal(link.icon.toLowerCase(),(exe+',0').toLowerCase(),'Shortcut must use the branded executable icon');
  assert.match((await exec(reg,['query',locationKey,'/v','InstallLocation','/reg:64'],{windowsHide:true})).stdout,new RegExp(install.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  await fs.mkdir(path.dirname(sentinel));await fs.writeFile(sentinel,saved);await fs.writeFile(outside,saved);
  // Exercise the complete packaged app via its installed location.
  await exec(process.execPath,['scripts/test-native-studio.mjs',exe],{windowsHide:true,timeout:120000,env:{...process.env,DD84_NATIVE_OUTPUT:output}});
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({executablePath:exe,args:['--user-data-dir='+path.join(output,'running-profile')],env});
  const page=await app.firstWindow();await page.locator('#nav-open').click();await page.locator('#new').click();
  const cell=page.locator('#parameter-table input[type=number]').first();await cell.fill('12');await cell.press('Tab');
  const pid=await app.evaluate(()=>process.pid);
  assert.equal((await run(setup,['/S','/D='+checkedInstall()])).code,2,'Installer must not close a running Studio');
  assert.equal((await uninstall()).code,2,'Uninstaller must not close a running Studio');
  assert.equal(await app.evaluate(()=>process.pid),pid);assert.equal(await cell.inputValue(),'12');await verifyInstalled();
  await closeTestApp(); // Wait for only this synthetic session to exit.
  assert.equal((await run(setup,['/S','/D='+checkedInstall()])).code,0);await verifyInstalled();
  assert.equal(await fs.readFile(sentinel,'utf8'),saved);assert.equal(await fs.readFile(outside,'utf8'),saved);
  assert.equal((await uninstall(['--delete-app-data'])).code,2,'Data-deletion switch must be rejected');await verifyInstalled();
  // Controlled higher-version registry fixture: checks refusal, not a claim
  // that a real future app's data migration has been tested.
  await exec(reg,['add',key,'/v','DisplayVersion','/t','REG_SZ','/d','999.0.0','/f','/reg:64'],{windowsHide:true});
  try{assert.equal((await run(setup,['/S','/D='+checkedInstall()])).code,2,'Older installer must refuse downgrade');await verifyInstalled();}
  finally{await exec(reg,['add',key,'/v','DisplayVersion','/t','REG_SZ','/d',manifest.version,'/f','/reg:64'],{windowsHide:true});}
  assert.equal((await uninstall()).code,0);installed=false;
  for(const f of manifest.files)assert(!(await fs.stat(path.join(install,f.name)).catch(()=>null)),'Program file survived uninstall: '+f.name);
  assert.equal(await fs.readFile(sentinel,'utf8'),saved);assert.equal(await fs.readFile(outside,'utf8'),saved);
  assert(!(await fs.stat(shortcut).catch(()=>null)));assert(await absentRegistry(key));assert(await absentRegistry(locationKey));
  const proof={checkedAt:new Date().toISOString(),windows:os.release(),version:manifest.version,installerSha256:artifact.sha256,
    portableZipSha256:zip.sha256,portableZipFilesVerified:manifest.files.length,publicSignaturesVerified:!!signatures,
    installedFilesVerified:manifest.files.length,installedAppNativeHarnessPassed:true,startMenuCreatedAndRemoved:true,startMenuTargetAndIconVerified:true,
    runningInstallAndUninstallBlocked:true,unsavedEditorSurvived:true,sameVersionReinstallPassed:true,
    syntheticDowngradeGuardPassed:true,deleteAppDataSwitchRejected:true,unknownSavedFilesPreserved:true,
    registrationRemoved:true,cleanMachineAcceptance:false,realCrossVersionMigrationTested:false,hardwareAccessed:false,customerFilesAccessed:false};
  await fs.writeFile(path.join(output,'installer-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({output,...proof}));
}finally{
  await closeTestApp();
  if(installed){const result=await uninstall();assert.equal(result.code,0,'Test installation cleanup failed; inspect '+output);}
}
