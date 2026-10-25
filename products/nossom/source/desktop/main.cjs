const { app, BrowserWindow, Menu, shell, session, ipcMain, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const { createUpdates } = require('./updates.cjs');
const path = require('node:path');
const fs = require('node:fs');
const origin = 'https://nossom-teal.vercel.app';
let updates;
function safeExternal(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') void shell.openExternal(u.href);
  } catch {}
}
function start() {
  const win = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 800,
    minHeight: 640,
    title: 'NOSSOM',
    backgroundColor: '#080c10',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    safeExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin !== origin) {
        event.preventDefault();
        safeExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });
  void win.loadURL(origin + '/studio');
}
app.whenReady().then(() => {
  app.setAppUserModelId('com.nossom.studio');
  const trusted = (event) => {
    try {
      return (
        event.senderFrame === event.sender.mainFrame &&
        new URL(event.senderFrame.url).origin === origin
      );
    } catch {
      return false;
    }
  };
  updates = createUpdates({
    app,
    updater: autoUpdater,
    enabled:
      app.isPackaged &&
      require('./package.json').nossomUpdates === true &&
      fs.existsSync(path.join(process.resourcesPath, 'app-update.yml')),
    broadcast: (state) =>
      BrowserWindow.getAllWindows().forEach((win) =>
        win.webContents.send('nossom:update:state', state),
      ),
    notify: (version) => {
      if (!Notification.isSupported()) return;
      const notification = new Notification({
        title: 'Uma nova NOSSOM chegou',
        body: `A versão ${version} será baixada automaticamente e instalada quando você terminar seu trabalho.`,
        silent: true,
      });
      notification.on('click', () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        }
      });
      notification.show();
    },
  });
  ipcMain.handle('nossom:update:state', (event) => (trusted(event) ? updates.getState() : null));
  ipcMain.handle('nossom:update:command', (event, action) =>
    trusted(event) && ['check', 'download', 'install'].includes(action)
      ? updates.command(action)
      : null,
  );
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    let trusted = false;
    try {
      trusted = new URL(details.requestingUrl || contents.getURL()).origin === origin;
    } catch {}
    callback(
      trusted &&
        permission === 'media' &&
        (details.mediaTypes || []).length > 0 &&
        (details.mediaTypes || []).every((kind) => kind === 'audio'),
    );
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: 'NOSSOM', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] },
      {
        label: 'Editar',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'Visualizar',
        submenu: [
          { role: 'reload' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { role: 'togglefullscreen' },
        ],
      },
    ]),
  );
  start();
  updates.start();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) start();
  });
});
app.on('before-quit', () => updates?.stop());
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
