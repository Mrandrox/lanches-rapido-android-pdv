'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { initServer, stopServer, getServer } = require('./server-process');

let mainWindow = null;

app.setAppUserModelId('com.lanchesrapido.pdv');

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    title: 'Lanches Rápido - PDV',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function currentWindow() {
  return BrowserWindow.getAllWindows().find(w => w.isVisible()) || mainWindow;
}

function registerIpc() {
  ipcMain.handle('server:status', () => getServer());

  ipcMain.handle('printers:list', async () => {
    try {
      const win = currentWindow();
      if (!win) return [];
      return await win.webContents.getPrintersAsync();
    } catch (e) {
      return [];
    }
  });

  ipcMain.handle('print:html', async (event, opts) => {
    const html = String(opts && opts.html || '');
    if (!html) return { ok: false, error: 'HTML vazio' };
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, error: 'Janela indisponível' };
    let printWindow = null;
    try {
      printWindow = new BrowserWindow({
        show: false,
        parent: mainWindow,
        webPreferences: { contextIsolation: true, sandbox: true },
      });
      await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      const result = await printWindow.webContents.print({
        silent: opts.silent !== false,
        printBackground: true,
        deviceName: opts.deviceName || '',
        copies: opts.copies || 1,
      });
      return { ok: true, result };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      if (printWindow && !printWindow.isDestroyed()) printWindow.close();
    }
  });

  async function pickImage(title) {
    const win = currentWindow();
    const r = await dialog.showOpenDialog(win, {
      title,
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths.length) return null;
    const data = fs.readFileSync(r.filePaths[0]);
    const ext = path.extname(r.filePaths[0]).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    return `data:${mime};base64,${data.toString('base64')}`;
  }

  ipcMain.handle('dialog:logo', () => pickImage('Selecionar logo'));
  ipcMain.handle('dialog:image', () => pickImage('Selecionar imagem do produto'));
}

app.whenReady().then(() => {
  initServer();
  registerIpc();
  createMainWindow();

  if (process.env.SMOKE) {
    const smoke = require('./smoke');
    setTimeout(() => smoke.run(mainWindow), 600);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => stopServer());