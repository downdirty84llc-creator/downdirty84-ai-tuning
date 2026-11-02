// Compatibility coverage for the packaging-only glob/minimatch overrides.
// These exercise ASAR's actual traversal and unpack APIs, not mocked matchers.
// No Electron process, serial port, customer data or native binary is loaded.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import * as asar from '@electron/asar';
import {verifyArchive} from './verify-package.mjs';

function fixture(t) {
  // A space in the source path guards against traversal accidentally treating it
  // as a separator. Fixture file names also include scopes and brackets.
  const base = mkdtempSync(path.join(tmpdir(), 'dd84-asar compat-'));
  const source = path.join(base, 'source');
  mkdirSync(source);
  t.after(() => {
    asar.uncacheAll();
    assert.equal(path.dirname(path.resolve(base)), path.resolve(tmpdir()));
    assert(path.basename(base).startsWith('dd84-asar compat-'));
    rmSync(base, {recursive: true}); // Only this uniquely created test directory.
  });
  const put = (name, bytes) => {
    const filename = path.join(source, name);
    mkdirSync(path.dirname(filename), {recursive: true});
    writeFileSync(filename, bytes);
  };
  return {base, source, put, archive: path.join(base, 'app.asar')};
}

function entries(archive) {
  return asar.listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, ''));
}
function files(archive) {
  return entries(archive).filter(name => {
    const entry = asar.statFile(archive, path.normalize(name), false);
    return !entry.files && !entry.link;
  }).sort();
}

const nativePaths = [
  'root.node',
  'node_modules/@serialport/bindings-cpp/prebuilds/win32-x64/@serialport+bindings-cpp.node',
  'node_modules/space package/build/Release/addon[1].node',
  'node_modules/example/nested/deep/other.node'
];
const packedPaths = [
  'main.cjs',
  'node_modules/example/index.js',
  'node_modules/example/native.node.js',
  'node_modules/example/native.node.backup',
  'node_modules/example/.metadata.json',
  'node_modules/.cache/data.json'
];

test('ASAR glob traversal and production unpack pattern preserve exact files and bytes', async t => {
  const {base, source, archive, put} = fixture(t);
  const expected = new Map([...nativePaths, ...packedPaths].map((name, index) => [name, Buffer.from(`synthetic ${index}: ${name}`)]));
  for (const [name, bytes] of expected) put(name, bytes);
  mkdirSync(path.join(source, 'node_modules/example/empty'), {recursive: true});
  await asar.createPackageWithOptions(source, archive, {unpack: '**/*.node'});
  assert.deepEqual(files(archive), [...expected.keys()].sort());
  assert(entries(archive).includes('node_modules/example/empty'));
  for (const [name, bytes] of expected) {
    assert.deepEqual(asar.extractFile(archive, path.normalize(name)), bytes, name);
    const unpacked = Boolean(asar.statFile(archive, path.normalize(name)).unpacked);
    assert.equal(unpacked, nativePaths.includes(name), `unpack classification: ${name}`);
    assert.equal(existsSync(path.join(archive + '.unpacked', name)), unpacked, `unpacked file presence: ${name}`);
    if (unpacked) assert.deepEqual(readFileSync(path.join(archive + '.unpacked', name)), bytes);
  }
  const extracted = path.join(base, 'extracted');
  asar.extractAll(archive, extracted);
  for (const [name, bytes] of expected) assert.deepEqual(readFileSync(path.join(extracted, name)), bytes, name);
});

test('ASAR explicit dot:false excludes hidden paths without losing ordinary files', async t => {
  const {source, archive, put} = fixture(t);
  put('main.cjs', 'synthetic entry');
  put('.hidden', 'synthetic hidden');
  put('node_modules/example/.hidden.json', 'synthetic metadata');
  put('node_modules/.hidden-dir/file.js', 'synthetic hidden child');
  put('node_modules/example/visible.js', 'synthetic visible');
  await asar.createPackageWithOptions(source, archive, {dot: false, unpack: '**/*.node'});
  assert.deepEqual(files(archive), ['main.cjs', 'node_modules/example/visible.js']);
});

test('ASAR traversal keeps links explicit and does not drop similarly prefixed siblings', async t => {
  const {source, archive, put} = fixture(t);
  put('node_modules/actual/index.js', 'synthetic target');
  put('node_modules/alias-neighbor/keep.js', 'synthetic sibling');
  symlinkSync(path.join(source, 'node_modules/actual'), path.join(source, 'node_modules/alias'), process.platform === 'win32' ? 'junction' : 'dir');
  await asar.createPackageWithOptions(source, archive, {unpack: '**/*.node'});
  assert.deepEqual(files(archive), ['node_modules/actual/index.js', 'node_modules/alias-neighbor/keep.js']);
  assert.equal(path.normalize(asar.statFile(archive, path.normalize('node_modules/alias'), false).link), path.normalize('node_modules/actual'));
  assert(!entries(archive).some(name => name.startsWith('node_modules/alias/')));
  // DD84's package verifier must still reject any link rather than accepting
  // a newly traversed alias as regular packaged application code.
  assert.throws(() => verifyArchive(archive, source), /Packaged links are not allowed/);
});

test('ASAR rejects a directory link outside its source tree', async t => {
  const {base, source, archive, put} = fixture(t);
  put('main.cjs', 'synthetic entry');
  const outside = path.join(base, 'outside-source');
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'not-for-package.txt'), 'synthetic external marker');
  symlinkSync(outside, path.join(source, 'outside-link'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(asar.createPackageWithOptions(source, archive, {unpack: '**/*.node'}), /links out of the package/);
  assert.equal(readFileSync(path.join(outside, 'not-for-package.txt'), 'utf8'), 'synthetic external marker');
});
