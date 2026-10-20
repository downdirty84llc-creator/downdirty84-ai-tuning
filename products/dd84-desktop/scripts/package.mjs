import {packager} from '@electron/packager';
import {existsSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {includePath} from './runtime-files.mjs';
import {verifyPackage} from './verify-package.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === '--out'), 'Usage: npm run package -- [--out dist/subfolder]');
const out = path.resolve(root, args[1] ?? 'dist');
const relative = path.relative(path.join(root, 'dist'), out);
assert(!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep), 'Output must stay inside desktop/dist');
assert(!existsSync(path.join(out, 'DD84-Calibration-Studio-win32-x64')), 'Build already exists. Choose a new --out dist/subfolder.');
assert(!existsSync(path.join(out, 'package-verification.json')), 'Verification record already exists. Choose a new output folder.');
const folders = await packager({
  dir: root, name: 'DD84-Calibration-Studio', platform: 'win32', arch: 'x64',
  out, overwrite: false, asar: {unpack: '**/*.node'}, prune: true,
  ignore: name => !includePath(name)
});
assert.equal(folders.length, 1);
const verification = verifyPackage(folders[0]);
verification.sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
verification.sourceWorkingTreeDirty = Boolean(execFileSync('git', ['status', '--porcelain'], {cwd: root, encoding: 'utf8'}).trim());
verification.checkedAt = new Date().toISOString();
writeFileSync(path.join(out, 'package-verification.json'), JSON.stringify(verification, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({folder: folders[0], ...verification}, null, 2));
