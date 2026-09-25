const {app,BrowserWindow,session,dialog}=require('electron');
const path=require('node:path');
app.whenReady().then(()=>{
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,reply)=>reply(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  const win=new BrowserWindow({width:1200,height:850,minWidth:700,minHeight:550,backgroundColor:'#101820',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  session.defaultSession.on('will-download',(_event,item)=>{item.setSaveDialogOptions({title:'Save DD84 calibration file',defaultPath:path.join(app.getPath('documents'),item.getFilename())});});
  win.webContents.on('will-prevent-unload',event=>{if(dialog.showMessageBoxSync(win,{type:'question',buttons:['Keep editing','Discard and close'],defaultId:0,cancelId:0,message:'Discard unsaved calibration changes?'})===1)event.preventDefault();});
  win.removeMenu();win.loadFile(path.join(__dirname,'index.html'));
});
app.on('window-all-closed',()=>app.quit());
