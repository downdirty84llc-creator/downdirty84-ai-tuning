// Executed by the packaged Electron binary in non-GUI Node mode.
// All application/dependency imports must resolve inside this exact ASAR.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {createHash} = require('node:crypto');
(async () => {
  const archive = process.argv[1];
  const load = name => import(pathToFileURL(path.join(archive, name)).href);
  const manifest = require(path.join(archive, 'package.json'));
  const {SerialPort} = require(path.join(archive, 'node_modules/serialport'));
  assert.equal(typeof SerialPort, 'function'); // Loads the native binding; never opens a port.
  const project = await load('project.mjs');
  const original = project.sample();
  assert.equal(original.parameters.length, 6);
  const expected = structuredClone(original);
  expected.parameters.find(p => p.path === 'Airflow.MAF.Curve').values[0] = 12;
  const edited = project.edit(original, 'Airflow.MAF.Curve', 0, 12);
  assert.deepEqual(edited, expected);
  assert.deepEqual(original, project.sample());
  const bytes = Buffer.from(JSON.stringify(edited, null, 2));
  const {writeVerifiedCopy} = require(path.join(archive, 'saveFile.cjs'));
  const filename = path.join(process.cwd(), 'runtime-project.json');
  try {
    const saved = await writeVerifiedCopy(filename, bytes);
    assert.deepEqual(await fs.readFile(filename), bytes);
    assert.deepEqual(project.parse(await fs.readFile(filename, 'utf8')), expected);
    assert.equal(saved.sha256, createHash('sha256').update(bytes).digest('hex'));
    const bench = await load('bench.mjs');
    const plan = bench.makeBenchPlan('deadbeef', 4);
    const report = await bench.reviewBenchCapture({
      plan, session: '42', bytes: bench.rehearsalBytes(plan, '42'),
      filename: 'synthetic.bin', source: 'SOFTWARE_REHEARSAL'
    });
    assert.equal(report.comparison.comparisonPassed, true);
    assert.equal(report.comparison.matchedFrames, 4);
    assert.equal(report.externalCanValidated, false);
    assert.equal(report.vehicleData, false);
    console.log(JSON.stringify({
      version: manifest.version, electron: process.versions.electron,
      nativeSerialBindingLoaded: true, completeEditedProjectSavedAndReopened: true,
      originalPreserved: true, sharedBenchModulesPassed: true,
      savedProjectSha256: saved.sha256, hardwareAccessed: false
    }));
  } finally {
    await fs.unlink(filename).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
