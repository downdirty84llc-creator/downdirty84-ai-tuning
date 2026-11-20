// Wrap an already verified Windows package; never rebuild or edit its runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build,Platform,Arch} from 'electron-builder';
import {verifyPackage} from '../../products/dd84-desktop/scripts/verify-package.mjs';
import {distributionFiles} from './payload-files.mjs';

export const appId='com.downdirty84llc.calibrationstudio';
export const guid='92aff1b6-9307-49e6-9f9f-a9854aee6a0d';
const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(root,'../..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function inventory(folder,prefix='') {
  const result=[];
  for(const entry of await fs.readdir(path.join(folder,prefix),{withFileTypes:true})) {
    const name=path.posix.join(prefix,entry.name);
    assert(!entry.isSymbolicLink(),'Release package cannot contain links');
    if(entry.isDirectory())result.push(...await inventory(folder,name));
    else {assert(entry.isFile(),'Release entries must be regular files');const bytes=await fs.readFile(path.join(folder,name));result.push({name,bytes:bytes.length,sha256:hash(bytes)});}
  }
  return result.sort((a,b)=>a.name.localeCompare(b.name));
}
const escapeNsis=s=>s.replaceAll('$','$$').replaceAll('"','$\\"').replaceAll('/','\\');
async function run() {
  assert.equal(process.platform,'win32');assert.equal(process.argv.length,4,'Usage: node build.mjs <packaged-folder> <new-output-folder>');
  const source=await fs.realpath(process.argv[2]),out=path.resolve(process.argv[3]);
  const dist=path.join(repo,'products/dd84-desktop/dist'),relative=path.relative(dist,out);
  assert(relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep),'Output must be a new folder inside desktop/dist');
  const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json')));
  const verification=verifyPackage(source);assert.equal(pkg.version,verification.version,'Release tools version must match Studio');
  const original=await inventory(source),payload=distributionFiles(original);await fs.mkdir(out); // Refuse overwrite.
  const staged=path.join(out,'payload');await fs.mkdir(staged);
  for(const f of payload){const dest=path.join(staged,f.name);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(source,f.name),dest,1);}
  const dirs=new Set();for(const f of payload){let dir=path.posix.dirname(f.name);while(dir!=='.'){dirs.add(dir);dir=path.posix.dirname(dir);}}
  // No recursive directory deletion: unknown files, including saved work, survive.
  const removal=['!macro customRemoveFiles','  SetOutPath $TEMP',
    ...payload.map(f=>'  Delete "$INSTDIR\\'+escapeNsis(f.name)+'"'),
    '  Delete "$INSTDIR\\${UNINSTALL_FILENAME}"','  Delete "$INSTDIR\\uninstallerIcon.ico"',
    ...[...dirs].sort((a,b)=>b.length-a.length).map(d=>'  RMDir "$INSTDIR\\'+escapeNsis(d)+'"'),
    '  RMDir "$INSTDIR"','!macroend'];
  const include=path.join(out,'installer.nsh');
  await fs.writeFile(include,(await fs.readFile(path.join(root,'guards.nsh'),'utf8'))+'\n'+removal.join('\n')+'\n');
  process.env.CSC_IDENTITY_AUTO_DISCOVERY='false';
  const artifacts=await build({projectDir:root,prepackaged:staged,targets:Platform.WINDOWS.createTarget(['nsis','zip'],Arch.x64),publish:'never',config:{
    appId,productName:'DD84 Calibration Studio',executableName:'DD84-Calibration-Studio',
    electronVersion:JSON.parse(await fs.readFile(path.join(repo,'products/dd84-desktop/package.json'))).devDependencies.electron,
    directories:{output:out},publish:null,npmRebuild:false,
    win:{icon:path.join(repo,'products/dd84-desktop/assets/dd84.ico'),signAndEditExecutable:false,artifactName:'DD84-Calibration-Studio-${version}-Windows-x64-preview.${ext}'},
    nsis:{guid,oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:false,
      installerSidebar:path.join(root,'sidebar.bmp'),uninstallerSidebar:path.join(root,'sidebar.bmp'),
      createDesktopShortcut:false,createStartMenuShortcut:true,shortcutName:'DD84 Calibration Studio',
      deleteAppDataOnUninstall:false,packElevateHelper:false,runAfterFinish:false,differentialPackage:false,
      include,artifactName:'DD84-Calibration-Studio-${version}-Windows-x64-preview-Setup.exe'}
  }});
  assert.deepEqual(await inventory(source),original,'Original package changed');
  assert.deepEqual(await inventory(staged),payload,'Installer payload differs from verified package');
  const outputs=[];for(const name of artifacts){const bytes=await fs.readFile(name);outputs.push({name:path.basename(name),bytes:bytes.length,sha256:hash(bytes)});await fs.writeFile(name+'.sha256',hash(bytes)+'  '+path.basename(name)+'\n',{flag:'wx'});}
  const record={version:pkg.version,appId,guid,checkedAt:new Date().toISOString(),unsignedPreview:true,source:verification,omittedDiagnostics:original.filter(f=>!payload.includes(f)).map(f=>f.name),files:payload,artifacts:outputs};
  await fs.writeFile(path.join(out,'distribution-manifest.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output:out,version:pkg.version,artifacts:outputs}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await run();
