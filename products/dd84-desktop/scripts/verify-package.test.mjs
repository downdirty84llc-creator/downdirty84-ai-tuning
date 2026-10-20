import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import * as asar from '@electron/asar';
import {runtimeFiles} from './runtime-files.mjs';
import {verifyArchive} from './verify-package.mjs';

const binding = 'node_modules/@serialport/bindings-cpp/prebuilds/win32-x64/@serialport+bindings-cpp.node';
async function fixture(t, change = () => {}) {
  const base = mkdtempSync(path.join(tmpdir(), 'dd84-verifier-test-'));
  t.after(() => {
    asar.uncacheAll();
    assert.equal(path.dirname(path.resolve(base)), path.resolve(tmpdir()));
    assert(path.basename(base).startsWith('dd84-verifier-test-'));
    rmSync(base, {recursive: true}); // Only this verified, disposable test directory.
  });
  const root = path.join(base, 'source'), stage = path.join(base, 'stage');
  const files = new Map();
  for (const name of runtimeFiles) {
    const bytes = readFileSync(new URL('../' + name, import.meta.url));
    mkdirSync(path.dirname(path.join(root, name)), {recursive: true});
    writeFileSync(path.join(root, name), bytes);
    files.set(name, bytes);
  }
  const manifest = JSON.parse(files.get('package.json'));
  delete manifest.private; delete manifest.scripts; delete manifest.devDependencies;
  files.set('package.json', JSON.stringify(manifest));
  // Archive-structure test only; the real package test separately loads its native binary.
  files.set(binding, 'synthetic native-binding placeholder');
  change(files);
  for (const [name, bytes] of files) {
    mkdirSync(path.dirname(path.join(stage, name)), {recursive: true});
    writeFileSync(path.join(stage, name), bytes);
  }
  const archive = path.join(base, 'app.asar');
  await asar.createPackageWithOptions(stage, archive, {unpack: '**/*.node'});
  return {archive, root};
}
test('package verifier checks all allowed files and the sanitized versioned manifest', async t => {
  const {archive, root} = await fixture(t);
  assert.equal(verifyArchive(archive, root).applicationFilesChecked, runtimeFiles.length);
});
for (const [label, change, expected] of [
  ['modified code', files => files.set('project.mjs', '// altered'), /Packaged source differs: project/],
  ['missing module', files => files.delete('view.mjs'), /Missing runtime file: view/],
  ['unexpected local file', files => files.set('private-notes.txt', 'private'), /Unexpected packaged path/],
  ['tune hidden in dependencies', files => files.set('node_modules/example/customer.hpt', 'private'), /Forbidden packaged path/],
  ['missing native binding', files => files.delete(binding), /Missing Windows x64 serial binding/],
  ['wrong packaged version', files => {
    const manifest = JSON.parse(files.get('package.json')); manifest.version = '0.0.0';
    files.set('package.json', JSON.stringify(manifest));
  }, /Packaged manifest differs/]
]) {
  test(`package verifier rejects ${label}`, async t => {
    const {archive, root} = await fixture(t, change);
    assert.throws(() => verifyArchive(archive, root), expected);
  });
}
