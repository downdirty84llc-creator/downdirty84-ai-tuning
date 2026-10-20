import {createSaveClient} from './saveClient.mjs';
import {showMessage} from './navigation.mjs';

function browserDownload(text, filename) {
  const url = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

window.dd84Files?.onSaveWait(() => showMessage('A save is still in progress. Wait for its result, then close again.'));
export const saveJson = createSaveClient({bridge: window.dd84Files, browserDownload, notify: showMessage});
