const {app,BrowserWindow,session,dialog,ipcMain}=require('electron');
const board=require('./board.cjs');
const path=require('node:path');
const {installCloseGuard}=require('./closeGuard.cjs');
const {installFileSaving}=require('./saveFile.cjs');
const {installProjectRecovery}=require('./projectRecovery.cjs');
let mainWindow;
if(!app.requestSingleInstanceLock())app.quit();
else{
app.on('second-instance',()=>{if(mainWindow&&!mainWindow.isDestroyed()){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});
app.whenReady().then(()=>{
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,reply)=>reply(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  const win=new BrowserWindow({width:1280,height:900,minWidth:700,minHeight:550,backgroundColor:'#090d0b',icon:path.join(__dirname,'assets','dd84.ico'),webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,preload:path.join(__dirname,'preload.cjs')}});
  mainWindow=win;
  let boardBusy=false;
  const boardRequest=async(event,mode,port)=>{
    if(event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame)throw Error('Invalid caller.');
    if(boardBusy)throw Error('A board check is already running.');
    boardBusy=true;
    try{return await board.run(mode,port);}finally{boardBusy=false;}
  };
  ipcMain.handle('dd84-board-list',event=>boardRequest(event,'List'));
  ipcMain.handle('dd84-board-probe',(event,port)=>boardRequest(event,'Probe',port));
  ipcMain.handle('dd84-board-loopback',(event,port)=>boardRequest(event,'Loopback',port));
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  const saving=installFileSaving({win,ipcMain,dialog,documents:app.getPath('documents')});
  const recovery=installProjectRecovery({win,ipcMain,folder:app.getPath('userData')});
  session.defaultSession.on('will-download',(_event,item)=>item.cancel());
  installCloseGuard(win,dialog,{isSaving:()=>saving.isBusy()||recovery.isBusy()});
  win.removeMenu();win.loadFile(path.join(__dirname,'index.html'));
});
}
app.on('window-all-closed',()=>app.quit());
