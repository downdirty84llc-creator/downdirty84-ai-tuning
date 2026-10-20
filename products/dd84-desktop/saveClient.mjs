export function createSaveClient({bridge, browserDownload, notify}) {
  let pending = false;
  return async function save(value, filename, report = () => {}, {trailingNewline = false} = {}) {
    const announce = text => { notify(text); report(text); };
    if (pending) {
      announce('A save is already in progress. Finish it before starting another.');
      return {status: 'busy'};
    }
    pending = true;
    try {
      // Serialize before awaiting anything. Later edits cannot change this copy.
      const text = JSON.stringify(value, null, 2) + (trailingNewline ? '\n' : '');
      if (new TextEncoder().encode(text).length > 32 * 1024 * 1024) throw Error('The saved record exceeds 32 MiB.');
      if (!bridge) {
        browserDownload(text, filename);
        announce('Download requested. This browser preview cannot confirm completion; check the downloaded file.');
        return {status: 'unconfirmed'};
      }
      announce('Saving… Finish the file dialog and wait for the result before closing.');
      const result = await bridge.saveJson({filename, text});
      if (result?.status === 'saved' && typeof result.filename === 'string' &&
          Number.isSafeInteger(result.byteLength) && /^[a-f0-9]{64}$/.test(result.sha256)) {
        announce(`Saved ${result.filename}. File contents verified. Other panels and later edits need separate saves.`);
        return result;
      }
      if (result?.status === 'canceled') {
        announce('Save canceled. No file was written; your work is still open.');
        return result;
      }
      if (result?.status === 'busy') {
        announce('A save is already in progress. Finish it before starting another.');
        return result;
      }
      throw Error(result?.message || 'The save could not be confirmed. Keep this window open and try again.');
    } catch (error) {
      announce(`Save failed. ${error.message} Your work is still open.`);
      return {status: 'failed'};
    } finally {
      pending = false;
    }
  };
}
