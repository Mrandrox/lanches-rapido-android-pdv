'use strict';

const path = require('path');
const fs = require('fs');

let server = null;
const state = { running: false, port: 4175, url: '', error: '' };

// Localiza o navegador Chromium embutido para o WhatsApp:
//  - app empacotado: <resources>/wa-browser/.../chrome.exe
//  - desenvolvimento: browser/win/...
function findChromeExecutable() {
  const roots = [];
  if (process.resourcesPath) roots.push(path.join(process.resourcesPath, 'wa-browser'));
  roots.push(path.join(__dirname, '..', 'browser', 'win'));
  const seen = new Set();
  for (const root of roots) {
    if (!root || seen.has(root) || !fs.existsSync(root)) continue;
    seen.add(root);
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
      for (const ent of entries) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          stack.push(p);
        } else if (ent.name.toLowerCase() === 'chrome.exe') {
          return p;
        }
      }
    }
  }
  return null;
}

// Roda o servidor dentro do processo principal do Electron:
//  - funciona igual em desenvolvimento e em app empacotado (sem depender de `node`)
//  - o banco vai para o appData do Electron
function initServer() {
  if (server) return state;
  try {
    const { app } = require('electron');
    if (!process.env.DB_PATH) {
      process.env.DB_PATH = path.join(app.getPath('userData'), 'data.json');
    }
    const chrome = findChromeExecutable();
    if (chrome && !process.env.WA_BROWSER_PATH) {
      process.env.WA_BROWSER_PATH = chrome;
      console.log('[electron] Chromium embutido do WhatsApp:', chrome);
    }
    const port = parseInt(process.env.SERVER_PORT || '4175', 10);
    state.port = Number.isFinite(port) ? port : 4175;
    process.env.SERVER_PORT = String(state.port);

    server = require('../server/index.js');
    if (server && server.PORT) state.port = server.PORT;
    state.url = `http://localhost:${state.port}`;
    state.running = true;
    state.error = '';
  } catch (e) {
    state.running = false;
    state.error = e.message;
    console.error('[electron] erro ao iniciar servidor integrado:', e);
  }
  return { ...state };
}

function stopServer() {
  if (server && server.server) {
    try { server.server.close(); } catch (e) { /* ignore */ }
  }
  state.running = false;
}

function getServer() {
  return { ...state };
}

module.exports = { initServer, stopServer, getServer };