'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DEFAULT_DATA = () => ({
  store: {
    name: 'Minha Lanchonete',
    phone: '',
    address: '',
  },
  settings: {
    pin: '1234',
    defaultLimit: 20,
    preAlert: true,
    sound: true,
    vibrate: true,
    waMessage: 'Olá! Seu pedido {code} foi recebido. Previsão de {time}.',
    printer: {
      mode: 'auto',
      ip: '',
      port: 9100,
      proto: 'tcp',
      width: 32,
      cut: true,
      drawer: false,
      ascii: true,
      copies: 1,
    },
  },
  counters: { order: 0, note: 0 },
  orders: [],
  notes: [],
});

function dataPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const base = process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : process.platform === 'win32'
      ? process.env.APPDATA
      : path.join(os.homedir(), '.config');
  return path.join(base, 'bloco-pedidos', 'data.json');
}

const FILE = dataPath();
let db = null;
let dirty = false;
let timer = null;
const listeners = new Set();

function uid() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function load() {
  try {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!db || typeof db !== 'object' || !db.settings) throw new Error('formato invalido');
  } catch (e) {
    db = DEFAULT_DATA();
  }
  const base = DEFAULT_DATA();
  db.store = Object.assign({}, base.store, db.store || {});
  db.settings = Object.assign({}, base.settings, db.settings || {});
  db.settings.printer = Object.assign({}, base.settings.printer, db.settings.printer || {});
  db.counters = Object.assign({ order: 0, note: 0 }, db.counters || {});
  db.orders = Array.isArray(db.orders) ? db.orders : [];
  db.notes = Array.isArray(db.notes) ? db.notes : [];
  for (const o of db.orders) {
    if (o.limitMin == null) o.limitMin = db.settings.defaultLimit;
    if (typeof o.accumMs !== 'number') o.accumMs = 0;
  }
  return db;
}

function persistNow() {
  if (!dirty) return;
  dirty = false;
  clearTimeout(timer);
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 2));
    fs.renameSync(FILE + '.tmp', FILE);
  } catch (e) {
    console.error('[db] erro ao salvar:', e.message);
  }
}

function schedule() {
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(persistNow, 150);
}

function get() {
  return db;
}

function save(evt) {
  schedule();
  for (const fn of listeners) {
    try { fn(evt || 'save'); } catch (e) { console.error('[db] listener:', e.message); }
  }
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function orderById(id) {
  return db.orders.find(o => o.id === id);
}

function createOrder(input) {
  const items = (input.items || [])
    .map(i => ({
      qty: Math.max(1, parseInt(i.qty, 10) || 1),
      name: String(i.name || '').trim(),
      price: Math.max(0, Number(String(i.price || '0').replace(',', '.')) || 0),
    }))
    .filter(i => i.name);
  const number = (db.counters.order = (db.counters.order || 0) + 1);
  const now = new Date().toISOString();
  const order = {
    id: uid(),
    number,
    code: `#${String(number).padStart(3, '0')}`,
    createdAt: now,
    startedAt: null,
    doneAt: null,
    accumMs: 0,
    limitMin: Math.max(1, Math.round(Number(input.limitMin) || db.settings.defaultLimit || 20)),
    alerted: false,
    preAlerted: false,
    printedAt: null,
    printCount: 0,
    items,
    note: String(input.note || '').trim(),
    payment: String(input.payment || 'Pix').trim() || 'Pix',
    customer: {
      name: String(input.customer && input.customer.name || '').trim() || 'Balcão',
      phone: String(input.customer && input.customer.phone || '').trim(),
      type: input.customer && input.customer.type === 'entrega' ? 'entrega' : 'retirada',
      address: String(input.customer && input.customer.address || '').trim(),
    },
  };
  db.orders.unshift(order);
  save('orders');
  return order;
}

function totalOf(order) {
  return (order.items || []).reduce((acc, i) => acc + i.qty * i.price, 0);
}

module.exports = { get, load, save, onChange, uid, orderById, createOrder, totalOf, dataPath };
