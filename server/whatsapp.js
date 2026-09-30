'use strict';

const db = require('./db');
const ai = require('./ai');

const state = {
  client: null,
  status: 'off',
  qr: '',
  listeners: new Set(),
  orderHook: null,
};

function onOrderCreated(fn) { state.orderHook = fn; }

function push(evt) {
  state.qr = evt.type === 'qr' ? evt.data : state.qr;
  if (evt.type === 'ready' || evt.type === 'disconnected' || evt.type === 'failed' || evt.type === 'authenticated') {
    state.qr = '';
  }
  for (const fn of state.listeners) {
    try { fn(evt); } catch (e) { /* ignore */ }
  }
}

function getStatus() {
  return { status: state.status, qr: state.qr, required: !!state.required };
}

function onEvent(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

async function handleMessage(msg) {
  if (!msg.body || msg.fromMe) return;
  const text = msg.body.trim();
  push({ type: 'message', data: { from: msg.author || msg.from, text } });
  console.log('[wa] mensagem:', text);
  try {
    const parsed = await ai.parseOrder(text);
    if (!parsed.items.length) {
      push({ type: 'noitems', data: { text } });
      return;
    }
    const d = db.get();
    const products = d.products;
    const orderItems = parsed.items.map(i => {
      const p = products.find(x => x.id === i.id);
      return {
        id: p.id,
        name: p.name,
        price: p.price,
        qty: i.qty,
        total: +(p.price * i.qty).toFixed(2),
      };
    });
    const subtotal = +orderItems.reduce((s, i) => s + i.total, 0).toFixed(2);
    const s = d.settings;
    const order = {
      id: db.uid('o'),
      number: db.nextOrderNumber(),
      type: 'delivery',
      source: 'whatsapp',
      customer: parsed.customer || msg._data?.notifyName || 'Cliente WhatsApp',
      customerId: null,
      phone: (msg.author || msg.from || '').replace('@c.us', '').replace('@s.whatsapp.net', ''),
      address: parsed.address || '',
      items: orderItems,
      subtotal,
      discount: 0,
      deliveryFee: s.deliveryFee,
      total: +(subtotal + s.deliveryFee).toFixed(2),
      payment: 'Pendente',
      status: 'open',
      courierId: null,
      courierName: null,
      note: parsed.note || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      track: { lat: null, lng: null, accuracy: null, updatedAt: null, startedAt: null },
    };
    d.orders.unshift(order);
    db.save();
    push({ type: 'order', data: { id: order.id, number: order.number } });
    if (state.orderHook) { try { state.orderHook(order); } catch (e) { console.error('[wa] hook:', e); } }
  } catch (e) {
    console.error('[wa] erro ao processar pedido:', e);
  }
}

async function start(force) {
  if (state.status === 'starting' || state.status === 'ready') return getStatus();
  let wa;
  try {
    wa = require('whatsapp-web.js');
  } catch (e) {
    state.required = false;
    state.status = 'nolib';
    push({ type: 'nolib', data: { message: 'Instale com: npm install whatsapp-web.js' } });
    return getStatus();
  }
  state.required = true;
  state.status = 'starting';
  push({ type: 'status', data: { status: 'starting' } });

  const { Client, LocalAuth } = wa;
  const puppeteerOptions = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  if (process.env.WA_BROWSER_PATH) puppeteerOptions.executablePath = process.env.WA_BROWSER_PATH;
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: db.dataPath().replace('data.json', 'wa-session') }),
    puppeteer: puppeteerOptions,
  });
  state.client = client;

  client.on('qr', (qr) => {
    state.status = 'qr';
    push({ type: 'qr', data: qr });
  });
  client.on('authenticated', async () => {
    state.status = 'authenticated';
    push({ type: 'authenticated', data: {} });
  });
  client.on('ready', async () => {
    state.status = 'ready';
    db.get().settings.wa.connected = true;
    db.save();
    push({ type: 'ready', data: {} });
    client.sendMessage('me', '✅ Bot de pedidos conectado! Envie o pedido para receber.');
  });
  client.on('disconnected', (reason) => {
    state.status = 'disconnected';
    db.get().settings.wa.connected = false;
    db.save();
    push({ type: 'disconnected', data: { reason } });
  });
  client.on('auth_failure', (m) => {
    state.status = 'failed';
    push({ type: 'failed', data: { message: m } });
  });
  client.on('message', (msg) => handleMessage(msg));

  try {
    await client.initialize();
  } catch (e) {
    state.status = 'failed';
    push({ type: 'failed', data: { message: e.message } });
  }
  return getStatus();
}

function stop() {
  if (state.client) {
    try { state.client.destroy(); } catch (e) { /* ignore */ }
    state.client = null;
  }
  state.status = 'off';
  db.get().settings.wa.connected = false;
  db.save();
  push({ type: 'status', data: { status: 'off' } });
  return getStatus();
}

module.exports = { start, stop, getStatus, onEvent, onOrderCreated };