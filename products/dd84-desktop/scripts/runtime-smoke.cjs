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
  const {writeVerifiedCopy,validateRequest} = require(path.join(archive, 'saveFile.cjs'));
  const filename = path.join(process.cwd(), 'runtime-project.json');
  const caseFilename = path.join(process.cwd(), 'runtime-learning-case.json');
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
    const learning = await load('learning.mjs'), measurements = await load('learningMeasurements.mjs');
    const csv = 'HP Tuners CSV Log File\nVersion: 1.0\n[Channel Information]\n0,1\nOffset,Engine RPM\ns,rpm\n[Channel Data]\n0,0\n1,1000\n';
    const tuneHash = 'a'.repeat(64);
    const measured = await measurements.captureLearningMeasurement({
      raw: csv, name: 'synthetic.csv', tuneSha256: tuneHash, associationNote: 'Synthetic package check',
      selections: [{role: 'RPM', channelId: '1', evidence: 'Synthetic RPM channel'}]
    }, 'BEFORE_FINAL_LOG', 'Synthetic before-final recording');
    const learningCase = learning.attachLearningMeasurement({
      vehicle: 'Synthetic package check', displacementLiters: 5.3, camNotes: '', buildNotes: '',
      files: [{role: 'ORIGINAL', name: 'original.hpt', bytes: 4, sha256: tuneHash, tuneSha256: null}]
    }, measured);
    const caseBytes = validateRequest({filename: 'case.json', text: JSON.stringify(learningCase)});
    await writeVerifiedCopy(caseFilename, caseBytes);
    assert.deepEqual(await fs.readFile(caseFilename), caseBytes);
    const reopenedCase = learning.parseLearningCase(await fs.readFile(caseFilename, 'utf8'));
    assert.deepEqual(reopenedCase, learningCase);
    assert.equal(measurements.measurementCoverage(reopenedCase.measurements[0]).sourceStatus, 'SOURCE_RECHECK_REQUIRED');
    const rechecked = await measurements.recheckLearningMeasurement(reopenedCase.measurements[0], csv, 'renamed.csv');
    assert.equal(measurements.measurementCoverage(reopenedCase.measurements[0], [rechecked]).rows, 2);
    assert.equal(learning.learningReadiness(reopenedCase, [rechecked]).learningReady, false);
    console.log(JSON.stringify({
      version: manifest.version, electron: process.versions.electron,
      nativeSerialBindingLoaded: true, completeEditedProjectSavedAndReopened: true,
      originalPreserved: true, sharedBenchModulesPassed: true,
      savedProjectSha256: saved.sha256, learningCaseSavedReopenedAndRechecked: true, hardwareAccessed: false
    }));
  } finally {
    await fs.unlink(filename).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await fs.unlink(caseFilename).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
