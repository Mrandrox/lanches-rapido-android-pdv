'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lv', {
  serverStatus: () => ipcRenderer.invoke('server:status'),
  serverRestart: () => ipcRenderer.invoke('server:restart'),
  printers: () => ipcRenderer.invoke('printers:list'),
  printHtml: (opts) => ipcRenderer.invoke('print:html', opts),
  pickLogo: () => ipcRenderer.invoke('dialog:logo'),
  pickImage: () => ipcRenderer.invoke('dialog:image'),
});