import assert from 'node:assert/strict';

// Explicit Windows Electron payload. Fail closed if a tested folder acquired
// customer files or developer output. Only Chromium's known diagnostic log is
// omitted; original files are never removed or edited.
const runtime = new Set([
  'chrome_100_percent.pak','chrome_200_percent.pak','d3dcompiler_47.dll',
  'DD84-Calibration-Studio.exe','dxcompiler.dll','dxil.dll','ffmpeg.dll',
  'icudtl.dat','LICENSE','LICENSES.chromium.html','resources.pak',
  'resources/app.asar','snapshot_blob.bin','v8_context_snapshot.bin',
  'version','vk_swiftshader_icd.json','vk_swiftshader.dll','vulkan-1.dll'
]);
export function distributionFiles(files) {
  return files.filter(file => {
    if(file.name === 'debug.log') return false;
    assert(runtime.has(file.name)
      || /^locales\/[a-z]{2,3}(?:-[A-Z]{2}|-419)?\.pak$/.test(file.name)
      || /^resources\/app\.asar\.unpacked\/node_modules\/@serialport\/bindings-cpp\/prebuilds\/[a-z0-9+-]+\/@serialport\+bindings-cpp(?:\.[a-z0-9]+)*\.node$/.test(file.name),
    'Unexpected distribution file: '+file.name);
    return true;
  });
}
