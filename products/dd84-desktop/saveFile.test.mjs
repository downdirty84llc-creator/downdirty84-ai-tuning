import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {MAX_SAVE_BYTES, validateRequest, writeVerifiedCopy, installFileSaving} from './saveFile.cjs';
import {sample} from './project.mjs';
import {createSaveClient} from './saveClient.mjs';

const payload = () => ({filename: 'DD84-project.json', text: JSON.stringify(sample(), null, 2)});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve=yes; reject=no;}); return {promise, resolve, reject};};
async function folder(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dd84-save-test-'));
  t.after(async () => {
    for (const item of await fs.readdir(root, {withFileTypes:true})) {
      const target = path.join(root, item.name);
      if (item.isDirectory()) await fs.rmdir(target);
      else await fs.unlink(target);
    }
    await fs.rmdir(root);
  });
  return root;
}
function fixture({io = fs, documents = os.tmpdir()} = {}) {
  const win = new EventEmitter(), contents = new EventEmitter(), prompts = [], notifications = [];
  let handler, destroyed = false, focusCount = 0;
  contents.mainFrame = {};
  contents.focus = () => focusCount++;
  contents.send = name => notifications.push(name);
  win.webContents = contents;
  win.isDestroyed = () => destroyed;
  const service = installFileSaving({
    win, io, documents,
    ipcMain: {handle: (name, callback) => {assert.equal(name, 'dd84-save-json'); handler=callback;}},
    dialog: {showSaveDialog: (_win, options) => {
      const d = deferred(); prompts.push({...d, options}); return d.promise;
    }}
  });
  return {
    service, prompts, notifications,
    get focusCount() {return focusCount;},
    destroy: () => {destroyed = true;},
    save: (request = payload(), event = {sender:contents, senderFrame:contents.mainFrame}) => handler(event, request),
    close: () => {let prevented=false; win.emit('close', {preventDefault:()=>prevented=true}); return prevented;}
  };
}

test('save bridge bounds UTF-8 bytes and rejects invalid format, path and JSON before choosing a file', () => {
  const input = payload();
  assert.deepEqual(validateRequest(input), Buffer.from(input.text));
  for (const filename of ['../backup.json', 'C:\\backup.json', 'native.hpt', 'x.json:stream', 'x.json.']) {
    assert.throws(() => validateRequest({...input, filename}));
  }
  for (const text of ['{', 'null', '{}', '{"format":"UNKNOWN"}']) assert.throws(() => validateRequest({...input, text}));
  assert.throws(() => validateRequest({...input, text:'é'.repeat(MAX_SAVE_BYTES/2+1)}), /32 MiB/);
});

test('new and replaced saves preserve every byte and leave no temporary file', async t => {
  const root = await folder(t), target = path.join(root, 'tune copy.json');
  const original = Buffer.from(payload().text), next = Buffer.from(payload().text.replace('My multi-parameter simulation', 'Verified copy — Ω'));
  assert.notDeepEqual(original, next);
  for (const bytes of [original, next]) {
    const result = await writeVerifiedCopy(target, bytes);
    assert.deepEqual(await fs.readFile(target), bytes);
    assert.deepEqual(result, {byteLength:bytes.length, sha256:digest(bytes)});
    assert.deepEqual(await fs.readdir(root), ['tune copy.json']);
  }
});

for (const phase of ['open', 'write', 'sync', 'verify', 'rename']) {
  test(`failure during ${phase} preserves the original and cleans the owned temporary file`, async t => {
    const root = await folder(t), target = path.join(root, 'original.json');
    const original = Buffer.from('{"existing":"keep this exactly"}');
    await fs.writeFile(target, original);
    const before = await fs.stat(target, {bigint:true});
    const fail = () => {throw Object.assign(Error('Injected failure'), {code: phase==='write'?'ENOSPC':'EACCES'});};
    const io = {...fs,
      open: async (...args) => {
        if (phase==='open') fail();
        const handle = await fs.open(...args);
        return {
          writeFile: async bytes => {if (phase==='write') {await handle.writeFile(bytes.subarray(0,5)); fail();} await handle.writeFile(bytes);},
          sync: async () => {if (phase==='sync') fail(); await handle.sync();},
          close: () => handle.close()
        };
      },
      readFile: async (...args) => phase==='verify'?Buffer.from('corrupted'):fs.readFile(...args),
      rename: async (...args) => {if (phase==='rename') fail(); return fs.rename(...args);}
    };
    await assert.rejects(writeVerifiedCopy(target, Buffer.from(payload().text), io));
    assert.deepEqual(await fs.readFile(target), original);
    assert.equal((await fs.stat(target, {bigint:true})).mtimeNs, before.mtimeNs);
    assert.deepEqual(await fs.readdir(root), ['original.json']);
  });
}

test('a changed destination is not replaced by an older pending save', async t => {
  const root = await folder(t), target = path.join(root, 'copy.json'), external = Buffer.from('changed elsewhere');
  await fs.writeFile(target, 'original');
  const io = {...fs, readFile: async filename => {
    const bytes = await fs.readFile(filename);
    await fs.writeFile(target, external);
    return bytes;
  }};
  await assert.rejects(writeVerifiedCopy(target, Buffer.from(payload().text), io), /changed during saving/);
  assert.deepEqual(await fs.readFile(target), external);
  assert.deepEqual(await fs.readdir(root), ['copy.json']);
});

test('native tune extensions, relative paths, folders and symbolic destinations are rejected', async t => {
  const root = await folder(t), native = path.join(root, 'original.hpt'), directory = path.join(root, 'folder.json');
  await fs.writeFile(native, 'original tune'); await fs.mkdir(directory);
  for (const target of [native, directory, 'relative.json']) {
    await assert.rejects(writeVerifiedCopy(target, Buffer.from(payload().text)));
  }
  await assert.rejects(writeVerifiedCopy(path.join(root, 'link.json'), Buffer.from(payload().text), {
    lstat: async () => ({isFile:()=>true, isSymbolicLink:()=>true})
  }), /regular JSON/);
  assert.equal(await fs.readFile(native, 'utf8'), 'original tune');
});

test('canceled dialog writes nothing, unblocks closing and permits retry', async t => {
  const root = await folder(t), f = fixture({documents:root});
  const saving = f.save();
  assert.equal(f.service.isBusy(), true);
  assert.equal(f.close(), true);
  assert.deepEqual(f.notifications, ['dd84-save-wait']);
  assert.equal(f.prompts[0].options.defaultPath, path.join(root, 'DD84-project.json'));
  assert.ok(f.prompts[0].options.properties.includes('showOverwriteConfirmation'));
  assert.deepEqual(await f.save(), {status:'busy'});
  f.prompts[0].resolve({canceled:true});
  assert.deepEqual(await saving, {status:'canceled'});
  assert.equal(f.close(), false);
  assert.deepEqual(await fs.readdir(root), []);
  const retry = f.save(), target = path.join(root, 'retry.json');
  f.prompts[1].resolve({canceled:false, filePath:target});
  assert.deepEqual(await retry, {status:'saved', filename:'retry.json', byteLength:Buffer.byteLength(payload().text), sha256:digest(payload().text)});
  assert.equal(await fs.readFile(target, 'utf8'), payload().text);
  assert.equal(f.focusCount, 2);
});

test('closing and duplicate requests stay blocked until disk writing finishes', async t => {
  const root = await folder(t), hold = deferred();
  const f = fixture({io:{...fs, rename:async (...args)=>{await hold.promise; return fs.rename(...args);}}});
  const saving = f.save();
  f.prompts[0].resolve({canceled:false, filePath:path.join(root, 'copy.json')});
  await tick();
  assert.equal(f.close(), true);
  assert.equal((await f.save()).status, 'busy');
  hold.resolve();
  assert.equal((await saving).status, 'saved');
  assert.equal(f.close(), false);
});

test('invalid callers and malformed payloads cannot open a save dialog', async () => {
  const f = fixture();
  await assert.rejects(f.save(payload(), {sender:{}, senderFrame:{}}), /Invalid caller/);
  assert.equal((await f.save({filename:'../escape.json', text:'{}'})).status, 'failed');
  assert.equal(f.prompts.length, 0);
  assert.equal(f.service.isBusy(), false);
});

test('dialog and filesystem failures return actionable results without disclosing full paths', async t => {
  const root = await folder(t);
  for (const code of ['ENOSPC','EPERM','EIO']) {
    const f = fixture({io:{...fs, open:async()=>{throw Object.assign(Error('private path'), {code});}}});
    const saving = f.save();
    f.prompts[0].resolve({canceled:false, filePath:path.join(root, 'failed.json')});
    const result = await saving;
    assert.equal(result.status, 'failed'); assert.ok(result.message);
    assert.ok(!result.message.includes('private path'));
    assert.equal(f.service.isBusy(), false);
    assert.equal(f.close(), false);
  }
  const f = fixture(), saving = f.save();
  f.prompts[0].reject(Error('Dialog unavailable'));
  assert.equal((await saving).status, 'failed');
  assert.equal(f.service.isBusy(), false);
});

test('a destroyed window does not start a disk write after its dialog finishes', async t => {
  const root = await folder(t), f = fixture(), saving = f.save();
  f.destroy();
  f.prompts[0].resolve({canceled:false, filePath:path.join(root, 'copy.json')});
  assert.deepEqual(await saving, {status:'canceled'});
  assert.deepEqual(await fs.readdir(root), []);
  assert.equal(f.focusCount, 0);
});

test('renderer saves a fixed snapshot, serializes panel saves and reports confirmation', async () => {
  const pending = deferred(), requests = [], messages = [], local = [];
  const save = createSaveClient({bridge:{saveJson:r=>{requests.push(r);return pending.promise;}},notify:m=>messages.push(m)});
  const source = sample(), originalText = JSON.stringify(source,null,2);
  const first = save(source,'copy.json',m=>local.push(m));
  source.name = 'later edit';
  assert.equal((await save(source,'other.json')).status,'busy');
  assert.equal(requests.length,1);
  assert.equal(requests[0].text,originalText);
  pending.resolve({status:'saved',filename:'copy.json',byteLength:Buffer.byteLength(originalText),sha256:digest(originalText)});
  assert.equal((await first).status,'saved');
  assert.match(local.at(-1),/Saved copy.json.*later edits/);
  assert.equal(messages.at(-1),local.at(-1));
});

test('renderer cancellation, errors and malformed acknowledgments never claim a save', async () => {
  for (const outcome of [{status:'canceled'},{status:'failed',message:'Drive unavailable'},{status:'saved'},{status:'busy'}]) {
    const messages = [], save = createSaveClient({bridge:{saveJson:async()=>outcome},notify:m=>messages.push(m)});
    const result = await save(sample(),'copy.json');
    assert.notEqual(result.status,'saved');
    assert.ok(!messages.some(m=>m.startsWith('Saved ')));
    assert.notEqual((await save(sample(),'retry.json')).status,'saved');
  }
  const messages=[],save=createSaveClient({bridge:{saveJson:async()=>{throw Error('Disconnected');}},notify:m=>messages.push(m)});
  assert.equal((await save(sample(),'copy.json')).status,'failed');
  assert.match(messages.at(-1),/Your work is still open/);
});

test('browser fallback is explicitly unconfirmed and preserves bench newline convention', async () => {
  const downloads=[],messages=[];
  const save=createSaveClient({browserDownload:(...args)=>downloads.push(args),notify:m=>messages.push(m)});
  const value=sample();
  assert.equal((await save(value,'copy.json',undefined,{trailingNewline:true})).status,'unconfirmed');
  assert.equal(downloads[0][0],JSON.stringify(value,null,2)+'\n');
  assert.match(messages.at(-1),/cannot confirm/);
});
