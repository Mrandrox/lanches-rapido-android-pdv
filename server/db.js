'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DEFAULT_DATA = {
  settings: {
    name: 'Lanches Rápido',
    address: '',
    phone: '',
    logo: '',
    theme: 'dark',
    currency: 'R$',
    deliveryFee: 5,
    storeLat: -23.5505,
    storeLng: -46.6333,
    ai: { provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' },
    printer: { name: '', copies: 1 },
    wa: { connected: false },
    orderApp: { enabled: true, announcement: '' },
  },
  users: [
    { id: 'u-admin', name: 'Administrador', role: 'admin', pin: '1234', color: '#f59e0b', active: true, createdAt: '' },
  ],
  categories: [],
  products: [],
  customers: [],
  orders: [],
  cash: { open: false, openedAt: null, closedAt: null, operator: '', opening: 0, closing: 0, entries: [] },
  counters: { order: 0 },
};

function dataPath() {
  const env = process.env.DB_PATH;
  if (env) return env;
  const base = process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : process.platform === 'win32'
      ? process.env.APPDATA
      : path.join(os.homedir(), '.config');
  return path.join(base, 'lanches-caixa', 'data.json');
}

let FILE = dataPath();
let db = null;
let dirty = false;
let writeTimer = null;
const watchers = new Set();

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function load() {
  try {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    db = structuredClone(DEFAULT_DATA);
  }
  db.settings = Object.assign({}, structuredClone(DEFAULT_DATA.settings), db.settings || {});
  db.counters = Object.assign({ order: 0, customer: 0 }, db.counters || {});
  db.users = db.users || [];
  db.categories = db.categories || [];
  db.products = db.products || [];
  db.customers = db.customers || [];
  db.orders = db.orders || [];
  db.cash = Object.assign({}, structuredClone(DEFAULT_DATA.cash), db.cash || {});
  db.cash.entries = db.cash.entries || [];
  return db;
}

function persistNow() {
  if (!dirty) return;
  dirty = false;
  clearTimeout(writeTimer);
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.error('[db] erro ao salvar:', e.message);
  }
}

function scheduleWrite() {
  dirty = true;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(persistNow, 150);
}

function get() {
  return db;
}

function save() {
  scheduleWrite();
  const snapshot = db;
  for (const w of watchers) {
    try { w(snapshot, 'save'); } catch (e) { /* ignore */ }
  }
}

function onChange(fn) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

function trigger(eventName, payload) {
  for (const w of watchers) {
    try { w({ event: eventName, payload }, eventName); } catch (e) { /* ignore */ }
  }
}

function nextOrderNumber() {
  db.counters.order = (db.counters.order || 0) + 1;
  save();
  return db.counters.order;
}

function nextCustomerNumber() {
  db.counters.customer = (db.counters.customer || 0) + 1;
  save();
  return db.counters.customer;
}

module.exports = { get, load, save, onChange, trigger, uid, nextOrderNumber, nextCustomerNumber, dataPath };