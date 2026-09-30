'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const ai = require('./ai');
const wa = require('./whatsapp');

const PORT = parseInt(process.env.SERVER_PORT || process.env.ADMIN_PORT || '4175', 10);
const PUBLIC = path.join(__dirname, 'public');
let server = null;

db.load();
seedIfEmpty();
ensureDefaultDrinks();

// ---------------------------------------------------------------- helpers

function uid() { return crypto.randomBytes(24).toString('hex'); }
const tokens = new Map(); // token -> user

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj ?? {});
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Corpo da requisição muito grande.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('JSON inválido.')); }
    });
    req.on('error', reject);
  });
}

function auth(req) {
  const h = req.headers.authorization || '';
  return tokens.get(h.replace(/^Bearer\s+/i, '')) || null;
}

function mustRole(user, roles) {
  return user && roles.includes(user.role);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
};

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^([./\\])+/, ''));
  if (!file.startsWith(PUBLIC)) { sendJson(res, 403, { error: 'Fora do alcance.' }); return; }
  fs.readFile(file, (err, data) => {
    if (err) { sendJson(res, 404, { error: 'Não encontrado.' }); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

// ---------------------------------------------------------------- SSE hub

const sseClients = new Set();

function subscribeSSE(res, channels) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  const client = { res, channels, alive: true };
  sseClients.add(client);
  const keep = setInterval(() => { if (!client.alive) return; res.write(': ping\n\n'); }, 25000);
  req: {}
  res.on('close', () => {
    client.alive = false;
    sseClients.delete(client);
    clearInterval(keep);
  });
  return client;
}

function sseSend(client, event, data) {
  if (!client.alive) return;
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (e) { client.alive = false; }
}

function broadcast(channel, event, data) {
  for (const c of sseClients) {
    if (!c.channels.includes(channel)) continue;
    // entregador só recebe orders para ele
    if (channel === 'orders' && c.user && c.user.role === 'courier') {
      const o = data && data.order;
      if (!o || o.courierId !== c.user.id) continue;
    }
    sseSend(c, event, data);
  }
}

function broadcastOrder(order, evt, extra = {}) {
  const payload = { order, ...extra };
  broadcast('orders', evt, payload);
  broadcast(`order:${order.id}`, evt, payload);
}

function broadcastLocation(order) {
  const payload = { orderId: order.id, courierId: order.courierId, lat: order.track.lat, lng: order.track.lng, accuracy: order.track.accuracy, updatedAt: order.track.updatedAt };
  broadcast(`order:${order.id}`, 'location', payload);
  broadcast('orders', 'location', payload);
}

wa.onEvent((evt) => broadcast('wa', evt.type, evt.data));
wa.onOrderCreated((order) => broadcastOrder(order, 'order:new', { print: true, reason: 'whatsapp' }));

db.onChange(() => {
  try { db.save(); } catch (e) { /* ignore */ }
});

// ---------------------------------------------------------------- business

function seedIfEmpty() {
  const d = db.get();
  if (d.categories.length || d.products.length) return;
  const catNames = [
    ['Hambúrgueres', '🍔'],
    ['Acompanhamentos', '🍟'],
    ['Bebidas', '🥤'],
    ['Sobremesas', '🍨'],
  ];
  const catByName = {};
  for (const [name, icon] of catNames) {
    const c = { id: db.uid('c'), name, icon };
    catByName[name] = c.id;
    d.categories.push(c);
  }
  const prods = [
    ['Hambúrgueres', 'X-Burger', 'Pão, hambúrguer, queijo e maionese', 15],
    ['Hambúrgueres', 'X-Salada', 'Com alface e tomate', 16],
    ['Hambúrgueres', 'X-Bacon', 'Com bacon crocante e cheddar', 18],
    ['Hambúrgueres', 'X-Tudo', 'Tudo que tem direito', 22],
    ['Acompanhamentos', 'Batata Frita', 'Porção 300g', 10],
    ['Acompanhamentos', 'Nuggets', 'Porção 8 unidades', 12],
    ['Bebidas', 'Refrigerante Lata', 'Coca-Cola, Guaraná, Fanta', 6],
    ['Bebidas', 'Refrigerante 600ml', 'Coca-Cola, Guaraná ou Fanta', 8],
    ['Bebidas', 'Suco Natural', 'Laranja ou Limão', 8],
    ['Bebidas', 'Água Mineral', 'Garrafa 500ml', 4],
    ['Bebidas', 'Água com Gás', 'Garrafa 500ml', 4.5],
    ['Sobremesas', 'Milk Shake', 'Chocolate, morango ou baunilha', 12],
  ];
  for (const [cat, name, desc, price] of prods) {
    d.products.push({ id: db.uid('p'), categoryId: catByName[cat], name, description: desc, price, active: true, image: '' });
  }
  db.save();
  console.log('[seed] cardápio de exemplo criado.');
}

function ensureDefaultDrinks() {
  const d = db.get();
  const category = d.categories.find(c => c.name.toLowerCase() === 'bebidas');
  if (!category) return;
  const defaults = [
    ['Refrigerante 600ml', 'Coca-Cola, Guaraná ou Fanta', 8],
    ['Água Mineral', 'Garrafa 500ml', 4],
    ['Água com Gás', 'Garrafa 500ml', 4.5],
  ];
  let changed = false;
  for (const [name, description, price] of defaults) {
    if (d.products.some(p => p.categoryId === category.id && p.name === name)) continue;
    d.products.push({ id: db.uid('p'), categoryId: category.id, name, description, price, active: true, image: '' });
    changed = true;
  }
  if (changed) db.save();
}

function publicSettings() {
  const s = db.get().settings;
  return {
    name: s.name, address: s.address, phone: s.phone, logo: s.logo, theme: s.theme,
    currency: s.currency, deliveryFee: s.deliveryFee, storeLat: s.storeLat, storeLng: s.storeLng,
    orderApp: { enabled: s.orderApp.enabled !== false, announcement: s.orderApp.announcement || '' },
  };
}

function computeTotals(items, discInput, deliveryFee) {
  const subtotal = +items.reduce((s, i) => s + +(i.price * i.qty).toFixed(2), 0).toFixed(2);
  const discount = Math.min(Math.max(+discInput || 0, 0), subtotal);
  const total = +(subtotal - discount + +deliveryFee || 0).toFixed(2);
  return { subtotal, discount, total };
}

function orderView(order, withCourier = true) {
  const copy = { ...order, items: (order.items || []).map(i => ({ ...i })) };
  if (withCourier) {
    const u = db.get().users.find(x => x.id === order.courierId);
    copy.courierName = u ? u.name : null;
  }
  return copy;
}

function recalcAll() {
  const d = db.get();
  d.orders.forEach(o => {
    const t = computeTotals(o.items || [], o.discount || 0, o.type === 'delivery' ? o.deliveryFee || 0 : 0);
    o.subtotal = t.subtotal; o.total = t.total; o.deliveryFee = o.type === 'delivery' ? o.deliveryFee || 0 : 0;
  });
}

function createOrder(body, source) {
  const d = db.get();
  const items = [];
  for (const it of body.items || []) {
    const p = d.products.find(x => x.id === it.id);
    if (!p) continue;
    items.push({ id: p.id, name: p.name, price: p.price, qty: Math.max(1, parseInt(it.qty, 10) || 1) });
  }
  if (!items.length) throw new Error('Nenhum produto válido no pedido.');
  items.forEach(i => { i.total = +(i.price * i.qty).toFixed(2); });

  let customer = null;
  let customerId = body.customerId || null;
  if (!customerId && body.customer) {
    customer = d.customers.find(c => String(c.phone || '').replace(/\D/g, '') === String(body.customer || '').replace(/\D/g, ''));
    if (!customer) {
      customer = { id: db.uid('cu'), name: body.customerName || body.customer, phone: body.customer || '', address: body.address || '', note: '', createdAt: new Date().toISOString() };
      d.customers.push(customer);
      customerId = customer.id;
      db.save();
    } else customerId = customer.id;
  }
  const cust = customer || d.customers.find(c => c.id === customerId) || null;

  const isDelivery = (body.type || 'counter') === 'delivery';
  const fee = isDelivery ? +(body.deliveryFee ?? d.settings.deliveryFee) : 0;
  const { subtotal, discount, total } = computeTotals(items, body.discount, fee);
  const number = db.nextOrderNumber();
  const order = {
    id: db.uid('o'),
    number,
    type: isDelivery ? 'delivery' : 'counter',
    source: source || 'pdv',
    customer: cust ? cust.name : (body.customer || 'Consumidor'),
    customerId: cust ? cust.id : null,
    phone: body.phone || (cust && cust.phone) || '',
    address: isDelivery ? (body.address || (cust && cust.address) || '') : '',
    items,
    subtotal, discount, deliveryFee: fee, total,
    payment: body.payment || 'Pendente',
    status: isDelivery ? 'open' : 'finished',
    courierId: body.courierId || null,
    note: body.note || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    track: { lat: null, lng: null, accuracy: null, updatedAt: null, startedAt: null },
  };
  d.orders.unshift(order);
  db.save();
  return order;
}

const STATUS_FLOW = {
  open: ['preparing', 'route', 'canceled'],
  preparing: ['route', 'canceled'],
  route: ['delivered', 'canceled'],
  delivered: [],
  finished: [],
  canceled: [],
};

function setOrderStatus(order, status, user) {
  const next = order.status;
  if (next === 'route' && status === 'delivered') {
    order.status = 'delivered';
    order.updatedAt = new Date().toISOString();
    order.track.deliveredAt = new Date().toISOString();
    db.save();
    broadcastOrder(order, 'order', { reason: 'status' });
    return order;
  }
  if (user.role === 'courier' && !(order.courierId === user.id && ['route', 'delivered'].includes(status))) {
    throw new Error('Entregador só pode iniciar/confirmar a própria entrega.');
  }
  if (!STATUS_FLOW[next] || !STATUS_FLOW[next].includes(status)) {
    throw new Error(`Transição inválida: ${next} -> ${status}`);
  }
  order.status = status;
  order.updatedAt = new Date().toISOString();
  if (status === 'route') { order.track.startedAt = new Date().toISOString(); order.courierId = user.role === 'courier' ? user.id : order.courierId; }
  if (status === 'delivered') order.track.deliveredAt = new Date().toISOString();
  db.save();
  broadcastOrder(order, 'order', { reason: 'status' });
  return order;
}

function cashState() {
  const c = db.get().cash;
  const sales = db.get().orders
    .filter(o => o.status === 'finished' || o.status === 'delivered')
    .reduce((s, o) => s + o.total, 0);
  const withdrawals = c.entries.filter(e => e.kind === 'withdraw').reduce((s, e) => s + e.value, 0);
  const deposits = c.entries.filter(e => e.kind === 'deposit').reduce((s, e) => s + e.value, 0);
  return { ...c, sales, expected: +(c.opening + sales + deposits - withdrawals).toFixed(2), balance: +(c.opening + sales + deposits - withdrawals).toFixed(2) };
}

// ---------------------------------------------------------------- router

async function handleApi(req, res, url, pathname) {
  const method = req.method;
  const seg = pathname.split('/').filter(Boolean);
  const route = seg.length ? seg.join('/') : '';

  const publicView = (order) => ({
    id: order.id, number: order.number, type: order.type, customer: order.customer, phone: order.phone,
    items: order.items, subtotal: order.subtotal, discount: order.discount, deliveryFee: order.deliveryFee,
    total: order.total, payment: order.payment, status: order.status, note: order.note,
    courierName: order.courierName, address: order.address, store: publicSettings(),
    createdAt: order.createdAt, updatedAt: order.updatedAt,
    track: order.track || { lat: null, lng: null },
  });

  if (route === 'api/health') {
    return sendJson(res, 200, { ok: true, name: db.get().settings.name, version: 1 });
  }

  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' });
    return res.end();
  }

  if (route === 'api/login' && method === 'POST') {
    const body = await readBody(req);
    const user = db.get().users.find(u => u.active !== false && String(u.pin) === String(body.pin || '').trim());
    if (!user) return sendJson(res, 401, { error: 'PIN inválido.' });
    const token = uid();
    tokens.set(token, { ...user });
    return sendJson(res, 200, { token, user: { id: user.id, name: user.name, role: user.role, color: user.color } });
  }

  if (route === 'api/me') {
    const user = auth(req);
    if (!user) return sendJson(res, 401, { error: 'Não autenticado.' });
    return sendJson(res, 200, { user: { id: user.id, name: user.name, role: user.role, color: user.color } });
  }

  if (route === 'api/bootstrap' && method === 'GET') {
    const user = auth(req);
    if (!user) return sendJson(res, 401, { error: 'Não autenticado.' });
    const d = db.get();
    const base = {
      settings: publicSettings(),
      categories: d.categories,
      products: d.products.map(p => ({ ...p })),
    };
    if (user.role === 'courier') {
      base.users = d.users.map(u => ({ id: u.id, name: u.name }));
      base.orders = d.orders.filter(o => o.courierId === user.id && ['open', 'preparing', 'route'].includes(o.status)).map(orderView);
      base.cash = cashState();
      return sendJson(res, 200, base);
    }
    base.users = d.users.map(u => ({ id: u.id, name: u.name, role: u.role, color: u.color, active: u.active }));
    base.customers = d.customers;
    base.orders = d.orders.map(orderView);
    base.cash = cashState();
    base.settings.ai = { ...d.settings.ai };
    base.settings.printer = { ...d.settings.printer };
    base.settings.wa = { ...d.settings.wa };
    return sendJson(res, 200, base);
  }

  // ---------- app público (cliente Android/iOS)
  const ipHits = new Map();
  function throttle(ip, limit, windowMs) {
    const now = Date.now();
    let arr = (ipHits.get(ip) || []).filter(t => now - t < windowMs);
    arr.push(now);
    if (arr.length > 300) arr = arr.slice(-100);
    ipHits.set(ip, arr);
    return arr.length > limit;
  }
  function clientIp(req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
  }

  if (route === 'api/public/bootstrap' && method === 'GET') {
    const d = db.get();
    return sendJson(res, 200, {
      store: publicSettings(),
      categories: d.categories,
      products: d.products.filter(p => p.active !== false).map(p => ({ id: p.id, categoryId: p.categoryId, name: p.name, description: p.description, price: p.price, image: p.image })),
    });
  }

  if (route === 'api/public/ai-parse' && method === 'POST') {
    const ip = clientIp(req);
    if (throttle(ip, 25, 60000)) return sendJson(res, 429, { error: 'Muitas tentativas, aguarde um pouco.' });
    const body = await readBody(req, 5000);
    try {
      const parsed = await ai.parseOrder(String(body.text || '').slice(0, 500));
      const d = db.get();
      const items = parsed.items.map(i => {
        const p = d.products.find(x => x.id === i.id);
        return p ? { id: p.id, name: p.name, price: p.price, qty: i.qty, total: +(p.price * i.qty).toFixed(2) } : null;
      }).filter(Boolean);
      if (!items.length) return sendJson(res, 200, { ok: false, phrase: parsed.phrase || 'Não entendi o pedido.', items: [] });
      return sendJson(res, 200, { ok: true, phrase: parsed.phrase || '', items });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (route === 'api/public/orders' && method === 'POST') {
    const ip = clientIp(req);
    if (throttle(ip, 40, 60000)) return sendJson(res, 429, { error: 'Muitos pedidos em pouco tempo, aguarde.' });
    try {
      const body = await readBody(req);
      if (!db.get().settings.orderApp.enabled) return sendJson(res, 403, { error: 'Pedidos pelo app desativados pela loja.' });
      const order = createOrder(body, 'app');
      broadcastOrder(order, 'order:new', { print: true, reason: 'app' });
      return sendJson(res, 201, publicView(order));
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // ---------- pedido público (rastreio)
  const mTrack = pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (mTrack && method === 'GET') {
    const order = db.get().orders.find(o => o.id === mTrack[1]);
    if (!order) return sendJson(res, 404, { error: 'Pedido não encontrado.' });
    const u = db.get().users.find(x => x.id === order.courierId);
    const view = publicView(order);
    view.courierName = u ? u.name : view.courierName;
    return sendJson(res, 200, view);
  }

  // ---------- pedidos (protegidos)
  if (route === 'api/orders' && method === 'POST') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    try {
      const body = await readBody(req);
      const order = createOrder(body, body.source || 'pdv');
      broadcastOrder(order, 'order:new', { print: body.print !== false, reason: 'new' });
      return sendJson(res, 201, orderView(order));
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  const mStatus = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (mStatus && method === 'POST') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator', 'courier'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const order = db.get().orders.find(o => o.id === mStatus[1]);
    if (!order) return sendJson(res, 404, { error: 'Pedido não encontrado.' });
    const body = await readBody(req);
    try {
      setOrderStatus(order, body.status, user);
      return sendJson(res, 200, orderView(order));
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  const mAssign = pathname.match(/^\/api\/orders\/([^/]+)\/assign$/);
  if (mAssign && method === 'POST') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const order = db.get().orders.find(o => o.id === mAssign[1]);
    if (!order) return sendJson(res, 404, { error: 'Pedido não encontrado.' });
    const body = await readBody(req);
    const courier = db.get().users.find(u => u.id === body.courierId && u.role === 'courier');
    if (!courier) return sendJson(res, 400, { error: 'Entregador inválido.' });
    order.courierId = courier.id;
    order.updatedAt = new Date().toISOString();
    db.save();
    broadcastOrder(order, 'order', { reason: 'assign' });
    return sendJson(res, 200, orderView(order));
  }

  // ---------- entregador
  if (route === 'api/courier/orders' && method === 'GET') {
    const user = auth(req);
    if (!mustRole(user, ['courier', 'admin'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const list = db.get().orders.filter(o => o.courierId === user.id).map(orderView);
    return sendJson(res, 200, list);
  }

  if (route === 'api/courier/location' && method === 'POST') {
    const user = auth(req);
    if (!mustRole(user, ['courier'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const body = await readBody(req);
    const lat = parseFloat(body.lat), lng = parseFloat(body.lng);
    if (isNaN(lat) || isNaN(lng)) return sendJson(res, 400, { error: 'Coordenadas inválidas.' });
    const actives = db.get().orders.filter(o => o.courierId === user.id && o.status === 'route');
    for (const o of actives) {
      o.track = { ...(o.track || {}), lat, lng, accuracy: parseFloat(body.accuracy) || null, updatedAt: new Date().toISOString() };
      broadcastLocation(o);
    }
    if (actives.length) { db.save(); }
    return sendJson(res, 200, { ok: true, updated: actives.map(o => o.id) });
  }

  // ---------- contas / usuários
  if (route === 'api/users' && method === 'POST') {
    const user = auth(req);
    if (!mustRole(user, ['admin'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const body = await readBody(req);
    if (!body.name || !String(body.pin || '').trim() || !['admin', 'operator', 'courier'].includes(body.role)) {
      return sendJson(res, 400, { error: 'Nome, PIN e cargo são obrigatórios.' });
    }
    db.get().users.push({
      id: db.uid('u'), name: body.name, role: body.role, pin: String(body.pin).trim(),
      color: body.color || '#64748b', active: true, createdAt: new Date().toISOString(),
    });
    db.save();
    return sendJson(res, 201, { ok: true });
  }

  const mUser = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (mUser && method === 'PUT') {
    const user = auth(req);
    if (!mustRole(user, ['admin'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const t = db.get().users.find(u => u.id === mUser[1]);
    if (!t) return sendJson(res, 404, { error: 'Usuário não encontrado.' });
    const body = await readBody(req);
    if (body.name !== undefined) t.name = body.name;
    if (body.role !== undefined && ['admin', 'operator', 'courier'].includes(body.role)) t.role = body.role;
    if (body.pin !== undefined) t.pin = String(body.pin).trim();
    if (body.color !== undefined) t.color = body.color;
    if (body.active !== undefined) t.active = !!body.active;
    db.save();
    return sendJson(res, 200, { ok: true });
  }

  if (mUser && method === 'DELETE') {
    const user = auth(req);
    if (!mustRole(user, ['admin'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    db.get().users = db.get().users.filter(u => u.id !== mUser[1]);
    db.save();
    return sendJson(res, 200, { ok: true });
  }

  // ---------- configurações
  if (route === 'api/settings' && method === 'POST') {
    const user = auth(req);
    if (!mustRole(user, ['admin'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const d = db.get();
    const body = await readBody(req);
    const s = d.settings;
    if (body.name !== undefined) s.name = String(body.name).slice(0, 60);
    if (body.address !== undefined) s.address = String(body.address).slice(0, 200);
    if (body.phone !== undefined) s.phone = String(body.phone).slice(0, 30);
    if (body.logo !== undefined) s.logo = String(body.logo).slice(0, 500000);
    if (body.theme !== undefined && ['light', 'dark'].includes(body.theme)) s.theme = body.theme;
    if (body.currency !== undefined) s.currency = String(body.currency).slice(0, 5) || 'R$';
    if (body.deliveryFee !== undefined) s.deliveryFee = Math.max(0, parseFloat(body.deliveryFee) || 0);
    if (body.storeLat !== undefined) s.storeLat = parseFloat(body.storeLat) || s.storeLat;
    if (body.storeLng !== undefined) s.storeLng = parseFloat(body.storeLng) || s.storeLng;
    if (body.orderApp) {
      if (body.orderApp.enabled !== undefined) s.orderApp.enabled = !!body.orderApp.enabled;
      if (body.orderApp.announcement !== undefined) s.orderApp.announcement = String(body.orderApp.announcement).slice(0, 300);
    }
    if (body.ai) {
      if (body.ai.provider !== undefined) s.ai.provider = String(body.ai.provider);
      if (body.ai.baseUrl !== undefined) s.ai.baseUrl = String(body.ai.baseUrl);
      if (body.ai.apiKey !== undefined) s.ai.apiKey = String(body.ai.apiKey);
      if (body.ai.model !== undefined) s.ai.model = String(body.ai.model);
    }
    if (body.printer) {
      if (body.printer.name !== undefined) s.printer.name = String(body.printer.name);
      if (body.printer.copies !== undefined) s.printer.copies = Math.max(1, parseInt(body.printer.copies, 10) || 1);
    }
    db.save();
    return sendJson(res, 200, { ok: true });
  }

  // ---------- cardápio
  if (route === 'api/categories' && method === 'POST') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const body = await readBody(req);
    if (!body.name) return sendJson(res, 400, { error: 'Nome obrigatório.' });
    db.get().categories.push({ id: db.uid('c'), name: String(body.name), icon: body.icon || '🍔', sort: db.get().categories.length });
    db.save();
    return sendJson(res, 201, { ok: true });
  }

  const mCat = pathname.match(/^\/api\/categories\/([^/]+)$/);
  if (route === 'api/categories' && method === 'GET') return sendJson(res, 200, db.get().categories);
  if (mCat && method === 'PUT') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const c = db.get().categories.find(x => x.id === mCat[1]);
    if (!c) return sendJson(res, 404, { error: 'Não encontrado.' });
    const body = await readBody(req);
    if (body.name !== undefined) c.name = String(body.name);
    if (body.icon !== undefined) c.icon = String(body.icon);
    db.save();
    return sendJson(res, 200, { ok: true });
  }
  if (mCat && method === 'DELETE') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    db.get().categories = db.get().categories.filter(x => x.id !== mCat[1]);
    db.save();
    return sendJson(res, 200, { ok: true });
  }

  if (route === 'api/products' && method === 'POST') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const body = await readBody(req);
    if (!body.name) return sendJson(res, 400, { error: 'Nome obrigatório.' });
    if (!db.get().categories.find(c => c.id === body.categoryId)) return sendJson(res, 400, { error: 'Categoria inválida.' });
    db.get().products.push({
      id: db.uid('p'), categoryId: body.categoryId, name: String(body.name).slice(0, 60),
      description: (body.description || '').slice(0, 200), price: +(body.price || 0),
      image: String(body.image || '').slice(0, 500000),
      active: body.active !== false,
    });
    db.save();
    return sendJson(res, 201, { ok: true });
  }

  const mProd = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (mProd && method === 'PUT') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const p = db.get().products.find(x => x.id === mProd[1]);
    if (!p) return sendJson(res, 404, { error: 'Não encontrado.' });
    const body = await readBody(req);
    if (body.categoryId !== undefined) p.categoryId = body.categoryId;
    if (body.name !== undefined) p.name = String(body.name).slice(0, 60);
    if (body.description !== undefined) p.description = String(body.description).slice(0, 200);
    if (body.price !== undefined) p.price = +body.price || 0;
    if (body.image !== undefined) p.image = String(body.image).slice(0, 500000);
    if (body.active !== undefined) p.active = !!body.active;
    db.save();
    return sendJson(res, 200, { ok: true });
  }

  if (mProd && method === 'DELETE') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    db.get().products = db.get().products.filter(x => x.id !== mProd[1]);
    db.save();
    return sendJson(res, 200, { ok: true });
  }

  // ---------- clientes
  if (route === 'api/customers' && method === 'POST') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const body = await readBody(req);
    if (!body.name && !body.phone) return sendJson(res, 400, { error: 'Informe nome ou telefone.' });
    db.get().customers.push({
      id: db.uid('cu'), name: String(body.name || '').slice(0, 60), phone: String(body.phone || '').slice(0, 30).replace(/\D/g, ''),
      address: String(body.address || '').slice(0, 200), note: String(body.note || '').slice(0, 300), createdAt: new Date().toISOString(),
    });
    db.save();
    return sendJson(res, 201, { ok: true });
  }

  const mCust = pathname.match(/^\/api\/customers\/([^/]+)$/);
  if (route === 'api/customers' && method === 'GET') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    return sendJson(res, 200, db.get().customers);
  }
  if (mCust && method === 'PUT') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const c = db.get().customers.find(x => x.id === mCust[1]);
    if (!c) return sendJson(res, 404, { error: 'Não encontrado.' });
    const body = await readBody(req);
    if (body.name !== undefined) c.name = String(body.name).slice(0, 60);
    if (body.phone !== undefined) c.phone = String(body.phone).slice(0, 30).replace(/\D/g, '');
    if (body.address !== undefined) c.address = String(body.address).slice(0, 200);
    if (body.note !== undefined) c.note = String(body.note).slice(0, 300);
    db.save();
    return sendJson(res, 200, { ok: true });
  }

  // ---------- caixa
  if (route === 'api/cash' && method === 'GET') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    return sendJson(res, 200, cashState());
  }

  if (route === 'api/cash/open' && method === 'POST') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const body = await readBody(req);
    const c = db.get().cash;
    if (c.open) return sendJson(res, 400, { error: 'Caixa já aberto.' });
    c.open = true;
    c.openedAt = new Date().toISOString();
    c.operator = user.name;
    c.opening = Math.max(0, parseFloat(body.opening) || 0);
    c.entries = [];
    db.save();
    return sendJson(res, 200, cashState());
  }

  if (route === 'api/cash/withdraw' || route === 'api/cash/deposit') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const body = await readBody(req);
    const c = db.get().cash;
    if (!c.open) return sendJson(res, 400, { error: 'Abra o caixa primeiro.' });
    c.entries.push({ kind: route.endsWith('withdraw') ? 'withdraw' : 'deposit', value: +body.value || 0, desc: String(body.desc || ''), at: new Date().toISOString(), by: user.name });
    db.save();
    return sendJson(res, 200, cashState());
  }

  if (route === 'api/cash/close' && method === 'POST') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const body = await readBody(req);
    const c = db.get().cash;
    if (!c.open) return sendJson(res, 400, { error: 'Caixa não está aberto.' });
    const state = cashState();
    c.closing = Math.max(0, parseFloat(body.counted ?? state.balance) || 0);
    c.closedAt = new Date().toISOString();
    c.open = false;
    db.save();
    return sendJson(res, 200, { ...state, closing: c.closing, difference: +(c.closing - state.balance).toFixed(2) });
  }

  // ---------- IA
  if (route === 'api/ai/parse' && method === 'POST') {
    const user = auth(req);
    if (!mustRole(user, ['admin', 'operator'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    const body = await readBody(req);
    try {
      const parsed = await ai.parseOrder(String(body.text || ''));
      const d = db.get();
      const items = parsed.items.map(i => {
        const p = d.products.find(x => x.id === i.id);
        return p ? { id: p.id, name: p.name, price: p.price, qty: i.qty, total: +(p.price * i.qty).toFixed(2) } : null;
      }).filter(Boolean);
      return sendJson(res, 200, { ...parsed, items });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (route === 'api/ai/test' && method === 'POST') {
    const user = auth(req);
    if (!mustRole(user, ['admin'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    return sendJson(res, 200, await ai.testConnection());
  }

  // ---------- WhatsApp
  if (route === 'api/wa/status' && method === 'GET') {
    const user = auth(req);
    if (!mustRole(user, ['admin'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    return sendJson(res, 200, wa.getStatus());
  }
  if (route === 'api/wa/connect' && method === 'POST') {
    const user = auth(req);
    if (!mustRole(user, ['admin'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    return sendJson(res, 200, await wa.start(true));
  }
  if (route === 'api/wa/disconnect' && method === 'POST') {
    const user = auth(req);
    if (!mustRole(user, ['admin'])) return sendJson(res, 403, { error: 'Sem permissão.' });
    return sendJson(res, 200, wa.stop());
  }

  // ---------- SSE
  if (route === 'api/sse') {
    const url = new URL(req.url, 'http://localhost');
    const channels = (url.searchParams.get('channels') || '').split(',').filter(Boolean);
    const user = auth(req);
    const okChannels = [];
    for (const ch of channels) {
      const m = ch.match(/^order:(.+)$/);
      if (m) {
        if (db.get().orders.find(o => o.id === m[1])) okChannels.push(ch);
      } else if (ch === 'wa' && mustRole(user, ['admin'])) {
        okChannels.push(ch);
      } else if (ch === 'courier' && user) {
        okChannels.push(ch);
      } else if (ch === 'orders' && user) {
        okChannels.push(ch);
      }
    }
    const client = subscribeSSE(res, okChannels);
    if (user) client.user = user;
    return;
  }

  return sendJson(res, 404, { error: 'Rota não encontrada.' });
}

// ---------------------------------------------------------------- http server

function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/') return serveStatic(req, res, '/');
  if (pathname.startsWith('/api/')) {
    handleApi(req, res, url, pathname).catch(e => {
      console.error('[api] erro:', e);
      if (!res.headersSent) sendJson(res, 500, { error: e.message });
      else { try { res.end(); } catch (_) {} }
    });
    return;
  }
  if (pathname.startsWith('/track/')) return fs.createReadStream(path.join(PUBLIC, 'track.html')).pipe(res);
  if (pathname === '/courier') return serveStatic(req, res, '/courier.html');
  if (pathname === '/manifest.webmanifest') return serveStatic(req, res, '/manifest.webmanifest');
  return serveStatic(req, res, pathname);
}

server = http.createServer(handler);
server.listen(PORT, () => {
  console.log(`[server] Lanches PDV rodando em http://localhost:${PORT}`);
  console.log(`[server] Rastreio:   http://<ip>:${PORT}/track/<id>`);
  console.log(`[server] Entregador: http://<ip>:${PORT}/courier`);
  console.log(`[server] Banco:      ${db.dataPath()}`);
});

process.on('SIGINT', () => { console.log('\n[server] encerrando...'); server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });

module.exports = { server, PORT };