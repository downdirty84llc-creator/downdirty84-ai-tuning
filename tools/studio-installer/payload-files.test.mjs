import {test} from 'node:test';
import assert from 'node:assert/strict';
import {distributionFiles} from './payload-files.mjs';

test('retain program bytes and omit only the known diagnostic log',()=>{
  const app={name:'resources/app.asar',sha256:'unchanged'};
  assert.deepEqual(distributionFiles([app,{name:'debug.log'}]),[app]);
});
test('allow shipped locales and native bindings',()=>{
  for(const name of ['locales/en-US.pak','locales/es-419.pak','locales/fil.pak',
    'resources/app.asar.unpacked/node_modules/@serialport/bindings-cpp/prebuilds/win32-x64/@serialport+bindings-cpp.node'])
    assert.equal(distributionFiles([{name}]).length,1);
});
test('reject extra customer files, credentials, source and traversal',()=>{
  for(const name of ['customer.hpt','recording.hpl','saved-case.json','.env',
    'resources/customer.csv','locales/customer.pak','locales/../secret.pak',
    'resources/app.asar.unpacked/customer.hpt','main.cjs','other.log'])
    assert.throws(()=>distributionFiles([{name}]),/Unexpected distribution file/);
});
