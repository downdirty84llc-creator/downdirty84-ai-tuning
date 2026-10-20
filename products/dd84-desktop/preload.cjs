const {contextBridge,ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('dd84Files', {
  saveJson: request => ipcRenderer.invoke('dd84-save-json', request),
  onSaveWait: callback => {
    const listener = () => callback();
    ipcRenderer.on('dd84-save-wait', listener);
    return () => ipcRenderer.removeListener('dd84-save-wait', listener);
  }
});
contextBridge.exposeInMainWorld('dd84Board', {
  list: () => ipcRenderer.invoke('dd84-board-list'),
  probe: port => ipcRenderer.invoke('dd84-board-probe',port),
  loopback: port => ipcRenderer.invoke('dd84-board-loopback',port)
});
