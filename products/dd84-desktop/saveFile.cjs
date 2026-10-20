const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID, createHash} = require('node:crypto');

const MAX_SAVE_BYTES = 32 * 1024 * 1024;
const FORMATS = new Set([
  'DD84_STUDIO_V2', 'DD84_STUDIO_REVIEW_V2',
  'DD84_CALIBRATION_DRAFT_V1', 'DD84_CALIBRATION_REVIEW_V1',
  'DD84_CALIBRATION_COMPARISON_V1', 'DD84_FILE_PAIR_V1',
  'DD84_LEARNING_CASE_V1', 'DD84_DIFFERENCES_V1',
  'DD84_LOG_INSPECTION_V1', 'DD84_LOG_SEGMENT_V1',
  'DD84_LOOPBACK_REPORT_V1', 'DD84_BENCH_PLAN_V1', 'DD84_STUDIO_BENCH_REVIEW_V1'
]);

function validateRequest(request) {
  if (!request || typeof request.filename !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}\.json$/.test(request.filename)) {
    throw Error('Use a DD84 JSON filename without folders.');
  }
  if (typeof request.text !== 'string' || Buffer.byteLength(request.text, 'utf8') > MAX_SAVE_BYTES) {
    throw Error('The saved record must be no larger than 32 MiB.');
  }
  let value;
  try { value = JSON.parse(request.text); } catch { throw Error('The saved record is not valid JSON.'); }
  if (!value || !FORMATS.has(value.format)) throw Error('This record format cannot be saved by Studio.');
  return Buffer.from(request.text, 'utf8');
}

async function targetState(io, target) {
  try {
    const stat = await io.lstat(target, {bigint: true});
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw Error('Choose a regular JSON file, not a folder or shortcut.');
    }
    return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// Never truncate the destination. Prepare, flush and verify a sibling file,
// then replace the destination with one rename on the same filesystem.
async function writeVerifiedCopy(target, bytes, io = fs) {
  if (!path.isAbsolute(target) || path.extname(target).toLowerCase() !== '.json') {
    throw Error('Choose a filename ending in .json. Native tune files cannot be overwritten.');
  }
  const previous = await targetState(io, target);
  const temporary = path.join(path.dirname(target), `.dd84-save-${randomUUID()}.tmp`);
  let handle, owned = false;
  try {
    handle = await io.open(temporary, 'wx', 0o600);
    owned = true;
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    const prepared = await io.readFile(temporary);
    if (!prepared.equals(bytes)) throw Error('The saved contents could not be verified. Try another location.');
    if (await targetState(io, target) !== previous) {
      throw Error('The destination changed during saving. Choose a new filename and try again.');
    }
    await io.rename(temporary, target);
    owned = false;
    return {byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
  } finally {
    if (handle) await handle.close().catch(() => {});
    if (owned) await io.unlink(temporary).catch(() => {});
  }
}

function failureMessage(error) {
  if (error.code === 'ENOSPC') return 'There is not enough free space. Choose another drive or free some space and retry.';
  if (['EACCES', 'EPERM', 'EBUSY'].includes(error.code)) return 'The file or folder is locked or unavailable. Choose another location and retry.';
  if (error.code) return 'The file could not be saved. Check the folder or drive and retry.';
  return error.message || 'The file could not be saved. Try again.';
}

function installFileSaving({win, ipcMain, dialog, documents, io = fs}) {
  let busy = false;
  const trusted = event => event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame;
  ipcMain.handle('dd84-save-json', async (event, request) => {
    if (!trusted(event)) throw Error('Invalid caller.');
    if (busy) return {status: 'busy'};
    busy = true;
    try {
      const bytes = validateRequest(request);
      const choice = await dialog.showSaveDialog(win, {
        title: 'Save DD84 file',
        defaultPath: path.join(documents, request.filename),
        filters: [{name: 'DD84 JSON record', extensions: ['json']}],
        properties: ['showOverwriteConfirmation', 'dontAddToRecent']
      });
      if (choice.canceled || !choice.filePath) return {status: 'canceled'};
      if (win.isDestroyed()) return {status: 'canceled'};
      const verified = await writeVerifiedCopy(choice.filePath, bytes, io);
      return {status: 'saved', filename: path.basename(choice.filePath), ...verified};
    } catch (error) {
      return {status: 'failed', message: failureMessage(error)};
    } finally {
      busy = false;
      if (!win.isDestroyed()) win.webContents.focus();
    }
  });
  // Protect the write even when no panel has unsaved edits. A close is never
  // queued: after the result, the operator can explicitly close again.
  win.on('close', event => {
    if (!busy) return;
    event.preventDefault();
    win.webContents.send('dd84-save-wait');
  });
  return {isBusy: () => busy};
}

module.exports = {MAX_SAVE_BYTES, validateRequest, writeVerifiedCopy, installFileSaving};
