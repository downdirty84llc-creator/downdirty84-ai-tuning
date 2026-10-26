// Explicit application allowlist: unknown local files never enter a release.
export const runtimeFiles = [
  'INDEPENDENT_SYSTEM.md', 'PARAMETER_PROJECT.md', 'README.md',
  'REAL_PARAMETER_DRAFTS.md', 'RELEASE_CHECKLIST.md',
  'bench.mjs', 'benchUI.mjs', 'benchWorker.mjs', 'board.cjs', 'boardUI.mjs',
  'closeGuard.cjs', 'differences.mjs', 'differencesUI.mjs',
  'filePair.mjs', 'filePairUI.mjs', 'index.html', 'learning.mjs', 'learningUI.mjs', 'learningMeasurements.mjs',
  'learningComparison.mjs', 'learningComparisonUI.mjs',
  'operatingContext.mjs',
  'operatingBand.mjs',
  'runSetup.mjs', 'runSetupUI.mjs',
  'link-shared/wire.mjs', 'link-shared/bench-acceptance.mjs',
  'logs.mjs', 'logsUI.mjs', 'main.cjs', 'measurements.mjs', 'model.mjs',
  'navigation.mjs', 'package.json', 'parameters.mjs', 'preload.cjs', 'project.mjs',
  'realAirflow.mjs', 'realCompare.mjs', 'realDraft.mjs', 'realImport.mjs',
  'saveClient.mjs', 'saveFile.cjs', 'saveFileUI.mjs', 'segment.mjs',
  'studio.css', 'studio.mjs', 'tableEdit.mjs', 'timeline.mjs', 'timelineUI.mjs', 'view.mjs'
];
export function includePath(input) {
  const name = input.replaceAll('\\', '/').replace(/^\/+/, '');
  return !name || name === 'node_modules' || name.startsWith('node_modules/') ||
    runtimeFiles.includes(name) || runtimeFiles.some(file => file.startsWith(name + '/'));
}
