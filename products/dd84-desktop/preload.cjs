const {contextBridge,ipcRenderer,webFrame} = require('electron');
// Display-only capability: no arbitrary zoom factors, paths or IPC channels.
webFrame.setZoomFactor(1);
contextBridge.exposeInMainWorld('dd84View', {
  setSize: percent => {
    if (![100,125,150,175,200].includes(percent)) throw Error('Unsupported view size.');
    webFrame.setZoomFactor(percent / 100);
    return Math.round(webFrame.getZoomFactor() * 100);
  }
});
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
