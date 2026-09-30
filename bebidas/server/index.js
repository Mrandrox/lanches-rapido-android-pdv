'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const ai = require('./ai');

db.load();

const PORT = parseInt(process.env.PORT || '4189', 10);
const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

const sessions = new Map();
const SSE_ADMIN = new Set();
const SSE_ORDER = new Map();

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8' });
  res.end(body);
}

function sendJson(res, code, obj) {
  send(res, code, JSON.stringify(obj));
}

function bodyOf(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function adminToken(req) {
  const t = req.headers['x-token'] || new URL(req.url, 'http://local').searchParams.get('token');
  const s = sessions.get(t);
  if (s && s.exp > Date.now()) return t;
  return null;
}

function login(pin) {
  if (String(pin) !== String(db.get().settings.adminPin)) return null;
  const token = crypto.randomBytes(18).toString('hex');
  sessions.set(token, { exp: Date.now() + 1000 * 60 * 60 * 12 });
  return token;
}

function publicProduct(p) {
  return { id: p.id, name: p.name, size: p.size, price: p.price, cat: p.cat };
}

function orderDetail(o) {
  const s = db.get().settings;
  const statusLabel = {
    novo: 'Novo pedido', preparando: 'Preparando', pronto: 'Pronto',
    rota: 'Saiu para entrega', entregue: 'Entregue', cancelado: 'Cancelado',
    retirado: 'Retirado',
  };
  const totalsByType = o.items.reduce((acc, i) => {
    acc.total += i.price * i.qty;
    acc.qty += i.qty;
    return acc;
  }, { total: 0, qty: 0 });
  const delivery = o.customer.type === 'entrega' ? s.deliveryFee : 0;
  return {
    id: o.id,
    number: o.number,
    code: o.code,
    status: o.status,
    statusLabel: statusLabel[o.status] || o.status,
    createdAt: o.createdAt,
    eta: estimateEta(o),
    items: o.items,
    totals: { ...totalsByType, delivery, grand: totalsByType.total + delivery },
    customer: {
      name: o.customer.name,
      phone: o.customer.phone,
      type: o.customer.type,
      address: o.customer.address || '',
      note: o.customer.note || '',
    },
  };
}

function estimateEta(o) {
  const s = db.get().settings;
  if (o.status === 'entregue' || o.status === 'retirado' || o.status === 'cancelado') return '-';
  const started = new Date(o.createdAt).getTime();
  let min = (s.eta.preparando || 8) + (s.eta.pronto || 4);
  if (o.customer.type === 'entrega') min += s.eta.rota || 12;
  if (o.status === 'preparando') min = Math.max(1, min - (s.eta.preparando || 8));
  if (o.status === 'pronto') min = o.customer.type === 'entrega' ? (s.eta.rota || 12) : 2;
  if (o.status === 'rota') min = (s.eta.rota || 12) / 2;
  const done = Date.now() - started;
  const remaining = Math.max(0, Math.round((min * 60000 - done) / 60000));
  return remaining > 0 ? `${remaining} min` : 'Já está chegando';
}

function broadcastOrder(orderId) {
  const snapshot = { event: 'orders:change', orderId };
  const fn = () => {
    const o = db.get().orders.find(x => x.id === orderId);
    if (!o) return null;
    const detail = orderDetail(o);
    for (const res of SSE_ADMIN) res.write(`event: orders\ndata: ${JSON.stringify(detail)}\n\n`);
    const subs = SSE_ORDER.get(orderId);
    if (subs) for (const res of subs) res.write(`data: ${JSON.stringify(detail)}\n\n`);
  };
  fn();
  db.save('orders:change', { orderId, fn }, true);
}

function productOf(id) {
  return db.get().products.find(p => p.id === id);
}

async function createOrder(payload) {
  const items = (payload.items || []).map(i => {
    const p = productOf(i.id);
    if (!p) return null;
    const qty = Math.max(1, parseInt(i.qty, 10) || 1);
    return { id: p.id, name: p.name, size: p.size, price: p.price, qty };
  }).filter(Boolean);
  if (!items.length) throw new Error('Carrinho vazio');
  const customer = {
    name: String(payload.customer.name || '').trim(),
    phone: String(payload.customer.phone || '').trim(),
    type: payload.customer.type === 'entrega' ? 'entrega' : 'retirada',
    address: String(payload.customer.address || '').trim(),
    note: String(payload.customer.note || '').trim(),
  };
  if (!customer.name || !customer.phone) throw new Error('Informe nome e telefone');
  if (customer.type === 'entrega' && !customer.address) throw new Error('Informe o endereço para entrega');
  const number = db.get().counters.order + 1;
  db.get().counters.order = number;
  const id = db.uid();
  const o = {
    id,
    number,
    code: `#${String(number).padStart(3, '0')}`,
    status: 'novo',
    createdAt: new Date().toISOString(),
    items,
    customer,
  };
  db.get().orders.unshift(o);
  setTimeout(() => broadcastOrder(id), 0);
  return o;
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel.startsWith('/track.html')) rel = '/track.html';
  const file = path.join(PUBLIC, rel.replace(/^\/+/, ''));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'proibido');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'não encontrado', 'text/plain; charset=utf-8');
    const ext = path.extname(file);
    send(res, 200, data, MIME[ext] || 'application/octet-stream');
  });
}

async function route(req, res, url) {
  const p = url.pathname;
  const q = url.searchParams;

  if (p === '/api/config') {
    const s = db.get().settings;
    return sendJson(res, 200, {
      name: s.name, tagline: s.tagline, phone: s.phone, address: s.address,
      deliveryFee: s.deliveryFee, ann: s.ann, ai: s.ai.key ? 'openai' : 'local',
    });
  }

  if (p === '/api/menu') {
    const cats = db.get().categories.map(c => ({
      id: c.id, name: c.name,
      items: db.get().products.filter(x => x.cat === c.id).map(publicProduct),
    })).filter(c => c.items.length);
    return sendJson(res, 200, cats);
  }

  if (p === '/api/ai/message' && req.method === 'POST') {
    const body = await bodyOf(req).catch(() => ({}));
    const { reply, items } = await ai.parseMessage(String(body.message || ''));
    const enriched = items.map(i => {
      const p = productOf(i.id);
      return p ? { id: p.id, name: p.name, size: p.size, price: p.price, qty: i.qty } : i;
    });
    return sendJson(res, 200, { reply, items: enriched });
  }

  if (p === '/api/orders' && req.method === 'POST') {
    try {
      const body = await bodyOf(req).catch(() => ({}));
      const o = await createOrder(body);
      return sendJson(res, 201, { ok: true, order: orderDetail(o) });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    }
  }

  if (p === '/api/orders' && req.method === 'GET') {
    if (!adminToken(req)) return sendJson(res, 401, { error: 'Não autorizado' });
    const list = db.get().orders.map(orderDetail).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sendJson(res, 200, list);
  }

  const orderMatch = p.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch && req.method === 'GET') {
    const o = db.get().orders.find(x => x.id === orderMatch[1]);
    if (!o) return sendJson(res, 404, { error: 'Pedido não encontrado' });
    return sendJson(res, 200, orderDetail(o));
  }

  const statusMatch = p.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (statusMatch && req.method === 'PATCH') {
    if (!adminToken(req)) return sendJson(res, 401, { error: 'Não autorizado' });
    const body = await bodyOf(req).catch(() => ({}));
    const o = db.get().orders.find(x => x.id === statusMatch[1]);
    if (!o) return sendJson(res, 404, { error: 'Pedido não encontrado' });
    const allowed = ['novo', 'preparando', 'pronto', 'rota', 'entregue', 'cancelado', 'retirado'];
    if (!allowed.includes(body.status)) return sendJson(res, 400, { error: 'Status inválido' });
    o.status = body.status;
    broadcastOrder(o.id);
    return sendJson(res, 200, { ok: true, order: orderDetail(o) });
  }

  if (p === '/api/admin/login' && req.method === 'POST') {
    const body = await bodyOf(req).catch(() => ({}));
    const token = login(body.pin);
    if (!token) return sendJson(res, 401, { error: 'PIN inválido' });
    return sendJson(res, 200, { ok: true, token });
  }

  if (p === '/api/events') {
    if (!adminToken(req)) return sendJson(res, 401, { error: 'Não autorizado' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 3000\n\n');
    for (const o of db.get().orders) res.write(`event: orders\ndata: ${JSON.stringify(orderDetail(o))}\n\n`);
    SSE_ADMIN.add(res);
    req.on('close', () => SSE_ADMIN.delete(res));
    return;
  }

  const trackMatch = p.match(/^\/api\/orders\/([^/]+)\/events$/);
  if (trackMatch) {
    const id = trackMatch[1];
    if (!db.get().orders.some(x => x.id === id)) return sendJson(res, 404, { error: 'Pedido não encontrado' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`retry: 3000\n\ndata: ${JSON.stringify(orderDetail(db.get().orders.find(x => x.id === id)))}\n\n`);
    if (!SSE_ORDER.has(id)) SSE_ORDER.set(id, new Set());
    SSE_ORDER.get(id).add(res);
    req.on('close', () => {
      SSE_ORDER.get(id).delete(res);
      if (!SSE_ORDER.get(id).size) SSE_ORDER.delete(id);
    });
    return;
  }

  if (p.startsWith('/api/')) return sendJson(res, 404, { error: 'Rota não encontrada' });

  return serveStatic(req, res, p);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  route(req, res, url).catch(e => {
    console.error('[server] erro:', e);
    if (!res.headersSent) sendJson(res, 500, { error: 'Erro interno', message: e.message });
  });
});

server.listen(PORT, () => {
  const s = db.get().settings;
  console.log(`[bebidas] ${s.name} rodando em http://localhost:${PORT}`);
  console.log(`[bebidas] Loja:   http://localhost:${PORT}/`);
  console.log(`[bebidas] Painel: http://localhost:${PORT}/adm.html`);
  if (process.env.SMOKE) {
    console.log('[bebidas] SMOKE OK, encerrando');
    setTimeout(() => process.exit(0), 300);
  }
});

module.exports = { server };