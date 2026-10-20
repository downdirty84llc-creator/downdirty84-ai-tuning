import assert from 'node:assert/strict';
import {readFileSync, lstatSync, mkdtempSync, rmdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as asar from '@electron/asar';
import {runtimeFiles, includePath} from './runtime-files.mjs';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
export function verifyArchive(archive, root = sourceRoot) {
  const entries = asar.listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, ''));
  for (const name of entries) {
    assert(includePath(name), `Unexpected packaged path: ${name}`);
    assert(!/(^|\/)(?:\.git|\.env(?:\.[^/]*)?|test\.mjs)(?:\/|$)|\.(?:hpt|hpl|hefi|terx|csv|test\.mjs)$/i.test(name),
      `Forbidden packaged path: ${name}`);
    assert(!asar.statFile(archive, path.normalize(name), false).link, `Packaged links are not allowed: ${name}`);
  }
  const sourceManifest = JSON.parse(readFileSync(path.join(root, 'package.json')));
  const expectedManifest = {...sourceManifest};
  delete expectedManifest.private;
  delete expectedManifest.scripts;
  delete expectedManifest.devDependencies;
  for (const name of runtimeFiles) {
    assert(entries.includes(name), `Missing runtime file: ${name}`);
    assert(lstatSync(path.join(root, name)).isFile(), `Source must be a regular file: ${name}`);
    const packaged = asar.extractFile(archive, path.normalize(name));
    if (name === 'package.json') {
      assert.deepEqual(JSON.parse(packaged), expectedManifest, 'Packaged manifest differs');
    } else {
      assert.deepEqual(packaged, readFileSync(path.join(root, name)), `Packaged source differs: ${name}`);
    }
  }
  assert(asar.extractFile(archive, 'index.html').toString().includes(`PREVIEW ${sourceManifest.version}`),
    'Displayed version differs from package version');
  const binding = 'node_modules/@serialport/bindings-cpp/prebuilds/win32-x64/@serialport+bindings-cpp.node';
  assert(entries.includes(binding), 'Missing Windows x64 serial binding');
  assert(asar.statFile(archive, path.normalize(binding)).unpacked, 'Native binding must be unpacked');
  assert(lstatSync(path.join(archive + '.unpacked', binding)).isFile(), 'Missing unpacked native binding');
  return {
    version: sourceManifest.version, applicationFilesChecked: runtimeFiles.length,
    asarSha256: createHash('sha256').update(readFileSync(archive)).digest('hex'),
    sourceMatches: true, unexpectedApplicationFilesAbsent: true
  };
}

export function verifyPackage(folder) {
  assert.equal(process.platform, 'win32', 'Windows runtime verification requires Windows');
  const archive = path.resolve(folder, 'resources/app.asar');
  const result = verifyArchive(archive);
  const scratch = mkdtempSync(path.join(tmpdir(), 'dd84-package-check-'));
  try {
    // Deliberately exclude system Node, NODE_PATH and NODE_OPTIONS.
    const env = {
      SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP, TMP: process.env.TMP,
      PATH: path.join(process.env.SystemRoot, 'System32'),
      ELECTRON_RUN_AS_NODE: '1'
    };
    const output = execFileSync(path.resolve(folder, 'DD84-Calibration-Studio.exe'), [
      '-e', readFileSync(new URL('./runtime-smoke.cjs', import.meta.url), 'utf8'), archive
    ], {env, cwd: scratch, windowsHide: true, timeout: 30000, encoding: 'utf8'});
    result.runtime = JSON.parse(output.trim());
    assert.equal(result.runtime.version, result.version);
    result.cleanMachineAcceptance = false;
    return result;
  } finally {
    // Remove only this empty, uniquely created directory. Never recursively delete.
    rmdirSync(scratch);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv[2], 'Supply the packaged application folder');
  console.log(JSON.stringify(verifyPackage(process.argv[2]), null, 2));
}
