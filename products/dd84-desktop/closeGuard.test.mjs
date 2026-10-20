import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {installCloseGuard} from './closeGuard.cjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(options) {
  const contents = new EventEmitter();
  let focused = 0, closed = 0, destroyed = false;
  contents.focus = () => { focused++; };
  const calls = [], pending = [];
  const win = {
    webContents: contents,
    isDestroyed: () => destroyed,
    close: () => { closed++; }
  };
  const dialog = {showMessageBox: (_parent, options) => {
    calls.push(options);
    return new Promise((resolve, reject) => pending.push({resolve, reject}));
  }};
  installCloseGuard(win, dialog, options);
  return {
    calls, pending,
    get focused() { return focused; },
    get closed() { return closed; },
    destroy() { destroyed = true; },
    request() {
      const result = {allowed: false};
      contents.emit('will-prevent-unload', {preventDefault: () => { result.allowed = true; }});
      return result;
    }
  };
}

test('keep editing leaves close canceled, restores focus and allows another prompt', async () => {
  const f = fixture(), first = f.request();
  assert.equal(first.allowed, false);
  await flush();
  assert.equal(f.calls[0].defaultId, 0);
  assert.equal(f.calls[0].cancelId, 0);
  f.pending[0].resolve({response: 0});
  await flush();
  assert.equal(f.closed, 0);
  assert.equal(f.focused, 1);
  assert.equal(first.allowed, false);
  f.request();
  await flush();
  assert.equal(f.calls.length, 2);
});

test('repeated close requests share one pending prompt and stay canceled', async () => {
  const f = fixture(), a = f.request(), b = f.request();
  await flush();
  assert.equal(f.calls.length, 1);
  assert.equal(a.allowed, false);
  assert.equal(b.allowed, false);
  f.pending[0].resolve({response: 0});
  await flush();
  assert.equal(f.closed, 0);
});

test('explicit discard permits only the subsequent close attempt', async () => {
  const f = fixture(), first = f.request();
  await flush();
  f.pending[0].resolve({response: 1});
  await flush();
  assert.equal(first.allowed, false);
  assert.equal(f.closed, 1);
  assert.equal(f.request().allowed, true);
  assert.equal(f.request().allowed, false);
  await flush();
  assert.equal(f.calls.length, 2);
});

test('dialog failure or unexpected response preserves the window', async () => {
  const f = fixture();
  f.request();
  await flush();
  f.pending[0].reject(new Error('Native dialog unavailable'));
  await flush();
  assert.equal(f.closed, 0);
  assert.equal(f.focused, 1);
  f.request();
  await flush();
  f.pending[1].resolve({response: 99});
  await flush();
  assert.equal(f.closed, 0);
  assert.equal(f.focused, 2);
});

test('destroyed windows are not prompted, refocused or closed again', async () => {
  const f = fixture();
  f.request();
  f.destroy();
  await flush();
  assert.equal(f.calls.length, 0);
  assert.equal(f.closed, 0);
  assert.equal(f.focused, 0);
  const g = fixture();
  g.request();
  await flush();
  g.destroy();
  g.pending[0].resolve({response: 1});
  await flush();
  assert.equal(g.closed, 0);
  assert.equal(g.focused, 0);
});

test('a save starting during the close prompt invalidates discard approval', async () => {
  let saving = false;
  const f = fixture({isSaving: () => saving});
  f.request();
  await flush();
  saving = true;
  f.pending[0].resolve({response: 1});
  await flush();
  assert.equal(f.closed, 0);
  saving = false;
  assert.equal(f.request().allowed, false);
  await flush();
  assert.equal(f.calls.length, 2);
});
