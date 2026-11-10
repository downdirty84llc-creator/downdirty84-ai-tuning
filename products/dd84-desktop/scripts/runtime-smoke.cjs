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
  const comparisonFilename = path.join(process.cwd(), 'runtime-learning-comparison.json');
  const measuredFilename = path.join(process.cwd(), 'runtime-measured-case.json');
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
    const csv = 'HP Tuners CSV Log File\nVersion: 1.0\n[Channel Information]\n0,1,2\nOffset,Engine RPM,Manifold Absolute Pressure\ns,rpm,kPa\n[Channel Data]\n0,0,80\n1,1000,100\n';
    const selections=[{role:'RPM',channelId:'1',evidence:'Synthetic RPM channel'},
      {role:'MAP',channelId:'2',evidence:'Synthetic pressure channel'}];
    const tuneHash = 'a'.repeat(64);
    const measured = await measurements.captureLearningMeasurement({
      raw: csv, name: 'synthetic.csv', tuneSha256: tuneHash, associationNote: 'Synthetic package check',
      selections
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
    const comparison = await load('learningComparison.mjs');
    const earlierCsv = csv.replace('1000', '900');
    const earlier = await measurements.captureLearningMeasurement({
      raw: earlierCsv, name: 'earlier.csv', tuneSha256: tuneHash, associationNote: 'Synthetic package check',
      selections
    }, 'EARLIER_LOG', 'Synthetic earlier recording');
    const comparisonCase = learning.attachLearningMeasurement(reopenedCase, earlier);
    const compared = await comparison.compareLearningWindows(comparisonCase, [earlier,rechecked], {
      beforeRole:'EARLIER_LOG',afterRole:'BEFORE_FINAL_LOG',channelRole:'RPM',
      beforeRange:{start:0,end:1},afterRange:{start:0,end:1},note:'Synthetic independent windows',
      operatingBand:{rpm:{min:0,max:950,unit:'rpm'},map:{min:80,max:100,unit:'kPa'}},
      runSetup:{before:{displacementLiters:5.3,evidenceNote:'Synthetic earlier build'},after:{displacementLiters:6,evidenceNote:'Synthetic later build'}},
      sensorChecks:{before:{device:'Synthetic device',outcome:'FAIL_REPORTED'},after:null}
    });
    assert.equal(compared.before.timeline.max, 900);
    assert.equal(compared.after.timeline.max, 1000);
    assert.equal(compared.learningReady, false);
    assert.equal(compared.format, 'DD84_LEARNING_COMPARISON_V5');
    assert.deepEqual(compared.operatingContext.channels[0].readingsInSharedRange, {before:2,after:1});
    assert.equal(compared.operatingContext.channels[1].status, 'RANGE_OVERLAP');
    assert.equal(compared.operatingContext.operatingConditionsMatched, false);
    assert.equal(compared.operatingBand.before.includedRows,2);
    assert.equal(compared.operatingBand.after.includedRows,1);
    assert.equal(compared.operatingBand.after.target.max,0);
    assert.equal(compared.operatingBand.operatingConditionsMatched,false);
    assert.deepEqual(compared.runSetup.counts,{missing:6,sameReported:0,differentReported:1});
    assert.equal(compared.runSetup.operatingConditionsMatched,false);
    assert.equal(compared.runSetup.sourceBindings.before.csvSha256,earlier.reference.source.textSha256);
    assert.equal(compared.sensorChecks.before.status,'REPORTED_FAILURE');
    assert.equal(compared.sensorChecks.sensorValidated,false);
    assert.equal(compared.selection.sensorChecks.before.binding.channelId,compared.before.timeline.channel.id);
    const comparisonBytes = validateRequest({filename:'comparison.json',text:JSON.stringify(compared)});
    await writeVerifiedCopy(comparisonFilename, comparisonBytes);
    assert.deepEqual(await fs.readFile(comparisonFilename), comparisonBytes);
    assert.deepEqual(await comparison.reopenLearningComparison(await fs.readFile(comparisonFilename,'utf8'), comparisonCase, [earlier,rechecked]), compared);
    const measuredCsv=await load('measuredCsv.mjs'),measuredReview=await load('measuredReview.mjs'),troubleshooting=await load('troubleshooting.mjs'),verification=await load('measuredVerification.mjs');
    const measuredFile=await measuredCsv.inspectMeasuredFile(Buffer.from(csv),'synthetic.csv');
    const measuredState=troubleshooting.blankCase();measuredState.format='DD84_TROUBLESHOOTING_CASE_V2';
    measuredState.measuredReview=measuredReview.normalizeMeasuredReview({format:'DD84_MEASURED_REVIEW_V1',writeStrategy:'SIMULATION_ONLY',learningReady:false,automaticApplication:false,
      before:{...measuredCsv.summarizeMeasuredFile(measuredFile,{start:0,end:1}),tune:null},after:null,
      outcome:{result:'unassessed',changeReason:'',changes:'',conditions:'',criterion:'',observation:'Synthetic packaged runtime test',nextAction:'',reviewer:''}});
    const measuredCase=troubleshooting.caseReport(measuredState),measuredBytes=validateRequest({filename:'measured-case.json',text:JSON.stringify(measuredCase)});
    await writeVerifiedCopy(measuredFilename,measuredBytes);assert.deepEqual(await fs.readFile(measuredFilename),measuredBytes);
    const restoredMeasured=troubleshooting.caseReport(troubleshooting.parseCase(await fs.readFile(measuredFilename,'utf8')));assert.deepEqual(restoredMeasured,measuredCase);
    assert.equal((await verification.recheckMeasuredSource(restoredMeasured.measuredReview,'before',Buffer.from(csv),'renamed.csv')).status,'SOURCE_AND_SUMMARY_MATCH');
    const editing=await load('measuredEditing.mjs');
    const updatedNotes=editing.updateMeasuredOutcome(restoredMeasured.measuredReview,{...restoredMeasured.measuredReview.outcome,result:'inconclusive',observation:'Synthetic follow-up without CSV reload'});
    assert.deepEqual(updatedNotes.before,restoredMeasured.measuredReview.before);assert.deepEqual(updatedNotes.after,restoredMeasured.measuredReview.after);
    assert.throws(()=>editing.assertMeasuredRebuildSources(updatedNotes,{}),/Reselect the earlier CSV/);
    const revisedCase=troubleshooting.caseReport({...restoredMeasured,measuredReview:updatedNotes});
    const revisedBytes=validateRequest({filename:'measured-case.json',text:JSON.stringify(revisedCase)});
    await writeVerifiedCopy(measuredFilename,revisedBytes);
    assert.deepEqual(troubleshooting.caseReport(troubleshooting.parseCase(await fs.readFile(measuredFilename,'utf8'))),revisedCase);
    restoredMeasured.measuredReview.before.channels[1].mean=450;
    assert.equal((await verification.recheckMeasuredSource(restoredMeasured.measuredReview,'before',Buffer.from(csv),'synthetic.csv')).status,'SUMMARY_MISMATCH');
    console.log(JSON.stringify({
      version: manifest.version, electron: process.versions.electron,
      nativeSerialBindingLoaded: true, completeEditedProjectSavedAndReopened: true,
      originalPreserved: true, sharedBenchModulesPassed: true,
      savedProjectSha256: saved.sha256, learningCaseSavedReopenedAndRechecked: true,
      learningComparisonSavedAndRecomputed: true, operatingContextRecomputed: true, operatingBandRecomputed:true, runSetupRecomputed:true, sensorChecksRecomputed:true, measuredCaseSavedReopenedAndSourceRechecked:true, alteredMeasuredSummaryDetected:true, outcomeNotesSavedWithoutChangingMeasurements:true, partialMeasuredRebuildBlocked:true, hardwareAccessed: false
    }));
  } finally {
    await fs.unlink(filename).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await fs.unlink(caseFilename).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await fs.unlink(comparisonFilename).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await fs.unlink(measuredFilename).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
