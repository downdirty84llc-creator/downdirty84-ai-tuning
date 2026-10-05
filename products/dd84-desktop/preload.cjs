const {contextBridge,ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('dd84Board', {
  list: () => ipcRenderer.invoke('dd84-board-list'),
  probe: port => ipcRenderer.invoke('dd84-board-probe',port),
  loopback: port => ipcRenderer.invoke('dd84-board-loopback',port)
});
