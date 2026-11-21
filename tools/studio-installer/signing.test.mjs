import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signingConfig,assertSignature,signingArguments,signatureInfo} from './signing.mjs';
const config={endpoint:'https://eus.codesigning.azure.net',account:'dd84-example',profile:'public-example',publisher:'Example Publisher',signtool:'C:\\tools\\signtool.exe',dlib:'C:\\tools\\Azure.CodeSigning.Dlib.dll'};
const signature={status:'Valid',publisher:config.publisher,subject:'CN=Example Publisher',issuer:'CN=Public CA',codeSigning:true,thumbprint:'a'.repeat(40),timestampThumbprint:'b'.repeat(40)};
test('signing requires an explicit provider endpoint, paths and exact publisher',()=>{
  assert.deepEqual(signingConfig(config),config);
  for(const change of [{endpoint:'https://eus.codesigning.azure.net.attacker.test'},{endpoint:'http://eus.codesigning.azure.net'},{endpoint:config.endpoint+'/?secret=1'},{publisher:'<publisher>'},{signtool:'relative.exe'},{account:'../profile'},{password:'secret'}])assert.throws(()=>signingConfig({...config,...change}));
});
test('untrusted, wrong-publisher, self-signed and untimestamped files fail closed',()=>{
  assert.deepEqual(assertSignature(signature,config.publisher),signature);
  for(const change of [{status:'NotSigned'},{status:'HashMismatch'},{publisher:'Other company'},{codeSigning:false},{issuer:signature.subject},{timestampThumbprint:null},{thumbprint:''}])assert.throws(()=>assertSignature({...signature,...change},config.publisher));
});
test('file paths remain literal arguments and SHA256 timestamping cannot be omitted',()=>{
  const file='C:\\output with spaces\\Studio.exe',args=signingArguments(file,config,'C:\\output\\metadata.json');
  assert.equal(args.at(-1),file);assert.equal(args[args.indexOf('/fd')+1],'SHA256');assert.equal(args[args.indexOf('/td')+1],'SHA256');assert.equal(args[args.indexOf('/tr')+1],'http://timestamp.acs.microsoft.com');assert(!args.includes('/a'));
});
test('Windows rejects the actual unsigned packaged candidate',{skip:process.platform!=='win32'||!process.env.DD84_UNSIGNED_TEST_EXE},async()=>{
  const info=await signatureInfo(process.env.DD84_UNSIGNED_TEST_EXE);
  assert.equal(info.status,'NotSigned');assert.throws(()=>assertSignature(info,config.publisher));
});
