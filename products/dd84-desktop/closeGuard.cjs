function installCloseGuard(win, dialog, {isSaving = () => false} = {}) {
  let prompting = false;
  let discardApproved = false;
  const restoreFocus = () => {
    if (!win.isDestroyed()) win.webContents.focus();
  };
  win.webContents.on('will-prevent-unload', event => {
    if (discardApproved) {
      discardApproved = false;
      event.preventDefault(); // Electron: override the page's cancellation.
      return;
    }
    if (prompting) return;
    prompting = true;
    // Let Chromium finish canceling this close before showing the native dialog.
    // A synchronous dialog inside the event can leave page focus inactive.
    Promise.resolve().then(() => {
      if (win.isDestroyed()) return {response: 0};
      return dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Keep editing', 'Discard and close'],
        defaultId: 0,
        cancelId: 0,
        message: 'Discard unsaved calibration changes?'
      });
    }).then(({response}) => {
      prompting = false;
      if (win.isDestroyed()) return;
      if (response === 1 && !isSaving()) {
        discardApproved = true;
        win.close();
      } else {
        restoreFocus();
      }
    }).catch(() => {
      prompting = false;
      discardApproved = false;
      restoreFocus();
    });
  });
}

module.exports = {installCloseGuard};
