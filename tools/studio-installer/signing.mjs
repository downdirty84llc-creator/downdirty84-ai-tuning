// Explicit Azure Artifact Signing only. Never enroll, create credentials, use a
// self-signed certificate, or silently turn a failed signed build into unsigned.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const regions=['brs','cus','eus','jpe','krc','ncus','neu','plc','scus','swn','wcus','weu','wus','wus2','wus3'];
export const publicRoot='Microsoft Identity Verification Root Certificate Authority 2020';
export function signingConfig(value){
  assert(value&&typeof value==='object'&&!Array.isArray(value),'Signing configuration required');
  const keys=['endpoint','account','profile','publisher','signtool','dlib'];
  assert.deepEqual(Object.keys(value).sort(),keys.sort(),'Unexpected signing configuration fields');
  for(const k of keys)assert(typeof value[k]==='string'&&value[k].trim()===value[k]&&value[k].length>0&&value[k].length<1000&&!/[\r\n\0]/.test(value[k]),'Invalid signing field: '+k);
  assert(regions.some(r=>value.endpoint===`https://${r}.codesigning.azure.net`),'Use an exact Microsoft regional signing endpoint');
  for(const k of ['account','profile'])assert(/^[A-Za-z0-9][A-Za-z0-9-]{1,99}$/.test(value[k]),'Invalid signing account/profile');
  assert(!/[<>]/.test(value.publisher)&&value.publisher.length<=200,'Expected exact validated publisher name');
  for(const k of ['signtool','dlib'])assert(path.win32.isAbsolute(value[k]),'Use an absolute Windows tool path');
  return {...value};
}
export function assertSignature(info,publisher,{timestamp=true}={}){
  assert.equal(info.status,'Valid','Authenticode signature is not trusted/valid');
  assert.equal(info.publisher,publisher,'Unexpected Authenticode publisher');
  assert(info.codeSigning,'Certificate must allow code signing');
  assert(info.subject&&info.issuer&&info.subject!==info.issuer,'Self-signed release certificates are not accepted');
  assert(/^[0-9a-f]{40}$/i.test(info.thumbprint||''),'Missing signer fingerprint');
  if(timestamp)assert(/^[0-9a-f]{40}$/i.test(info.timestampThumbprint||''),'Trusted timestamp required');
  return info;
}
export function signingArguments(file,config,metadata){
  return ['sign','/fd','SHA256','/tr','http://timestamp.acs.microsoft.com','/td','SHA256','/d','DD84 Calibration Studio','/dlib',config.dlib,'/dmdf',metadata,file];
}
export async function signatureInfo(file){
  // Read-only native cmdlets. The filename is an environment value, never code.
  const command=String.raw`$ErrorActionPreference='Stop'; $s=Get-AuthenticodeSignature -LiteralPath $env:DD84_VERIFY_FILE; $c=$s.SignerCertificate; [ordered]@{
    status=[string]$s.Status;
    publisher=if($c){$c.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false)}else{$null};
    subject=if($c){$c.Subject}else{$null}; issuer=if($c){$c.Issuer}else{$null};
    thumbprint=if($c){$c.Thumbprint}else{$null};
    codeSigning=[bool]($c -and @($c.EnhancedKeyUsageList | Where-Object { $_.ObjectId -eq '1.3.6.1.5.5.7.3.3' }).Count -gt 0);
    timestampThumbprint=if($s.TimeStamperCertificate){$s.TimeStamperCertificate.Thumbprint}else{$null}
  } | ConvertTo-Json -Compress`;
  const env={...process.env,DD84_VERIFY_FILE:path.resolve(file)};
  // A PowerShell 7 parent must not redirect Windows PowerShell to its modules.
  for(const k of Object.keys(env))if(k.toLowerCase()==='psmodulepath')delete env[k];
  const result=await exec(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:60000,env});
  return JSON.parse(result.stdout.replace(/^\uFEFF/,''));
}
async function invoke(file,args){
  try{return await exec(file,args,{windowsHide:true,timeout:180000});}
  catch(e){throw Error(`Signing tool failed (exit ${e.code??'unknown'}); no signed artifact is accepted.`,{cause:undefined});}
}
async function loadConfig(configPath){
  const config=signingConfig(JSON.parse(await fs.readFile(configPath,'utf8')));
  // Inspect both executables before invoking either. No service request here.
  for(const file of [config.signtool,config.dlib]){
    assert((await fs.lstat(file)).isFile(),'Signing tool must be a regular file');
    assertSignature(await signatureInfo(file),'Microsoft Corporation',{timestamp:false});
  }
  return config;
}
function verifier(config){return async file=>{
  await invoke(config.signtool,['verify','/pa','/all','/tw','/r',publicRoot,file]);
  return assertSignature(await signatureInfo(file),config.publisher);
};}
export async function createVerifier(configPath){const config=await loadConfig(configPath);return {verify:verifier(config),publisher:config.publisher};}
export async function createSigner(configPath,output){
  const config=await loadConfig(configPath);
  const metadata=path.join(output,'signing-metadata.json');
  await fs.writeFile(metadata,JSON.stringify({Endpoint:config.endpoint,CodeSigningAccountName:config.account,CertificateProfileName:config.profile,
    // Use only the owner's explicit Azure CLI session; no other cached identity.
    ExcludeCredentials:['EnvironmentCredential','WorkloadIdentityCredential','ManagedIdentityCredential','SharedTokenCacheCredential','VisualStudioCredential','VisualStudioCodeCredential','AzurePowerShellCredential','AzureDeveloperCliCredential','InteractiveBrowserCredential']}),{flag:'wx'});
  const records=[];
  const verify=verifier(config);
  async function sign(file){
    const relative=path.relative(output,file);
    assert(relative&&!path.isAbsolute(relative)&&!relative.startsWith('..'+path.sep)&&relative!=='..','Only this build output may be signed');
    assert(file.toLowerCase().endsWith('.exe'),'Only Studio and its NSIS executables are signed');
    await invoke(config.signtool,signingArguments(file,config,metadata));
    const info=await verify(file);records.push({file:relative.replaceAll('\\','/'),...info});
  }
  return {sign,verify,records,publisher:config.publisher};
}
