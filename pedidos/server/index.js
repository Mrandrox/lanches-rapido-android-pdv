'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const printer = require('./print');
const ws = require('./ws');
const mobile = require('./mobile');

db.load();

const PORT = parseInt(process.env.PORT || '4191', 10);
const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
};

const SESSION_MIN = 60 * 60 * 24 * 30;
const sessions = new Map();
const streams = new Set();

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
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

function login(pin) {
  if (String(pin) !== String(db.get().settings.pin)) return null;
  const token = crypto.randomBytes(18).toString('hex');
  sessions.set(token, Date.now() + SESSION_MIN * 1000);
  return token;
}

function authorized(req, url) {
  const t = (req.headers['x-token'] || (url && url.searchParams.get('token')) || '');
  const exp = sessions.get(t);
  if (exp && exp > Date.now()) return true;
  if (exp) sessions.delete(t);
  return false;
}

function state() {
  const d = db.get();
  return {
    store: d.store,
    settings: d.settings,
    counters: d.counters,
    orders: d.orders,
    notes: d.notes,
    serverNow: Date.now(),
  };
}

function broadcast() {
  const payload = `data: ${JSON.stringify(state())}\n\n`;
  for (const res of streams) {
    try { res.write(payload); } catch (e) { streams.delete(res); }
  }
}

db.onChange(broadcast);

const ORDERS_ACTIONS = {
  start(o) { if (!o.startedAt) o.startedAt = new Date().toISOString(); o.mobileStatus = 'preparing'; o.alerted = false; o.preAlerted = false; },
  pause(o) {
    if (o.startedAt) { o.accumMs = (o.accumMs || 0) + (Date.now() - new Date(o.startedAt).getTime()); o.startedAt = null; }
    o.mobileStatus = 'paused';
  },
  resume(o) { if (!o.startedAt && !o.doneAt) o.startedAt = new Date().toISOString(); o.mobileStatus = o.doneAt ? 'done' : 'preparing'; },
  reset(o) { o.startedAt = null; o.accumMs = 0; o.mobileStatus = o.doneAt ? 'done' : 'open'; o.alerted = false; o.preAlerted = false; },
  done(o) {
    if (o.startedAt) { o.accumMs = (o.accumMs || 0) + (Date.now() - new Date(o.startedAt).getTime()); o.startedAt = null; }
    o.doneAt = o.doneAt ? null : new Date().toISOString();
    o.mobileStatus = o.doneAt ? 'done' : 'open';
  },
  limit(o, v) { o.limitMin = Math.max(1, Math.round(Number(v) || 20)); },
  printed(o) { o.printedAt = new Date().toISOString(); o.printCount = (o.printCount || 0) + 1; },
  note(o, v) { o.note = String(v == null ? '' : v); },
  update(o, v) {
    if (Array.isArray(v.items)) {
      o.items = v.items
        .map(i => ({
          qty: Math.max(1, parseInt(i.qty, 10) || 1),
          name: String(i.name || '').trim(),
          price: Math.max(0, Number(String(i.price || '0').replace(',', '.')) || 0),
        }))
        .filter(i => i.name);
    }
    if (v.note != null) o.note = String(v.note).trim();
    if (v.payment != null) o.payment = String(v.payment).trim();
    if (v.customer) {
      o.customer = {
        name: String(v.customer.name || '').trim() || 'Balcão',
        phone: String(v.customer.phone || '').trim(),
        type: v.customer.type === 'entrega' ? 'entrega' : 'retirada',
        address: String(v.customer.address || '').trim(),
      };
    }
  },
};

async function route(req, res, url) {
  const p = url.pathname;
  const q = url.searchParams;

  if (p === '/api/login' && req.method === 'POST') {
    const body = await bodyOf(req).catch(() => ({}));
    const token = login(body.pin);
    if (!token) return sendJson(res, 401, { ok: false, error: 'PIN inválido' });
    return sendJson(res, 200, { ok: true, token });
  }

  if (p === '/api/state' && req.method === 'GET') {
    if (!authorized(req, url)) return sendJson(res, 401, { ok: false, error: 'Não autorizado' });
    return sendJson(res, 200, state());
  }

  if (p === '/api/mobile/sync' && req.method === 'POST') {
    if (!authorized(req, url)) return sendJson(res, 401, { ok: false, error: 'Não autorizado' });
    const body = await bodyOf(req);
    try {
      return sendJson(res, 200, Object.assign({ ok: true }, mobile.sync(body)));
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message || 'Não foi possível sincronizar.' });
    }
  }

  if (p === '/api/mobile/print' && req.method === 'POST') {
    if (!authorized(req, url)) return sendJson(res, 401, { ok: false, error: 'Não autorizado' });
    const body = await bodyOf(req);
    const configuration = db.get().settings.printer || {};
    const ip = String(configuration.ip || '').trim();
    if (!ip) return sendJson(res, 400, { ok: false, error: 'Configure o IP da impressora em Ajustes no computador.' });
    if (configuration.mode === 'bluetooth' || configuration.mode === 'sistema') {
      return sendJson(res, 400, { ok: false, error: 'O servidor só consegue imprimir em uma impressora de rede. Escolha IP na rede em Ajustes.' });
    }
    const copies = Math.max(1, Math.min(5, parseInt(body.copies, 10) || 1));
    try {
      const job = { ip, port: parseInt(configuration.port, 10) || 9100, proto: configuration.proto, data: body.data };
      let result;
      for (let i = 0; i < copies; i++) result = await printer.sendJob(job);
      return sendJson(res, 200, Object.assign({ ok: true, copies }, result));
    } catch (e) {
      return sendJson(res, 502, { ok: false, error: e.message || 'Falha ao imprimir.' });
    }
  }

  if (p === '/api/orders' && req.method === 'POST') {
    if (!authorized(req, url)) return sendJson(res, 401, { ok: false, error: 'Não autorizado' });
    const body = await bodyOf(req).catch(() => ({}));
    if (!Array.isArray(body.items) || !body.items.length) return sendJson(res, 400, { ok: false, error: 'Adicione ao menos um item.' });
    const order = db.createOrder(body);
    return sendJson(res, 201, { ok: true, order });
  }

  const orderMatch = p.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch) {
    if (!authorized(req, url)) return sendJson(res, 401, { ok: false, error: 'Não autorizado' });
    const o = db.orderById(orderMatch[1]);
    if (!o) return sendJson(res, 404, { ok: false, error: 'Pedido não encontrado' });
    if (req.method === 'PATCH') {
      const body = await bodyOf(req).catch(() => ({}));
      const fn = ORDERS_ACTIONS[body.action];
      if (!fn) return sendJson(res, 400, { ok: false, error: 'Ação inválida' });
      fn(o, body.value);
      db.save('orders');
      return sendJson(res, 200, { ok: true, order: o });
    }
    if (req.method === 'DELETE') {
      db.get().orders = db.get().orders.filter(x => x.id !== o.id);
      db.save('orders');
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 405, { ok: false, error: 'Método não permitido' });
  }

  if (p === '/api/notes' && req.method === 'POST') {
    if (!authorized(req, url)) return sendJson(res, 401, { ok: false, error: 'Não autorizado' });
    const body = await bodyOf(req).catch(() => ({}));
    const text = String(body.text || '').trim();
    if (!text) return sendJson(res, 400, { ok: false, error: 'Nota vazia' });
    const note = {
      id: db.uid(),
      number: (db.get().counters.note = (db.get().counters.note || 0) + 1),
      text,
      color: String(body.color || 'amarelo'),
      done: false,
      createdAt: new Date().toISOString(),
    };
    db.get().notes.unshift(note);
    db.save('notes');
    return sendJson(res, 201, { ok: true, note });
  }

  const noteMatch = p.match(/^\/api\/notes\/([^/]+)$/);
  if (noteMatch) {
    if (!authorized(req, url)) return sendJson(res, 401, { ok: false, error: 'Não autorizado' });
    const d = db.get();
    const note = d.notes.find(n => n.id === noteMatch[1]);
    if (!note) return sendJson(res, 404, { ok: false, error: 'Nota não encontrada' });
    if (req.method === 'PATCH') {
      const body = await bodyOf(req).catch(() => ({}));
      if (body.text != null) note.text = String(body.text).trim();
      if (body.color != null) note.color = String(body.color);
      if (body.done != null) note.done = !!body.done;
      db.save('notes');
      return sendJson(res, 200, { ok: true, note });
    }
    if (req.method === 'DELETE') {
      d.notes = d.notes.filter(n => n.id !== note.id);
      db.save('notes');
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 405, { ok: false, error: 'Método não permitido' });
  }

  if (p === '/api/settings' && req.method === 'PATCH') {
    if (!authorized(req, url)) return sendJson(res, 401, { ok: false, error: 'Não autorizado' });
    const body = await bodyOf(req).catch(() => ({}));
    const d = db.get();
    if (body.store) d.store = Object.assign({}, d.store, body.store);
    if (body.settings) {
      const { printer: pr, ...rest } = body.settings;
      d.settings = Object.assign({}, d.settings, rest);
      if (pr) d.settings.printer = Object.assign({}, d.settings.printer, pr);
    }
    db.save('settings');
    return sendJson(res, 200, { ok: true, state: state() });
  }

  if (p === '/api/print-http' && req.method === 'POST') {
    if (!authorized(req, url)) return sendJson(res, 401, { ok: false, error: 'Não autorizado' });
    const body = await bodyOf(req).catch(() => ({}));
    try {
      const r = await printer.sendJob(Object.assign({ proto: 'http' }, body));
      return sendJson(res, 200, Object.assign({ ok: true }, r));
    } catch (e) {
      return sendJson(res, 502, { ok: false, error: e.message });
    }
  }

  if (p === '/api/events') {
    if (!authorized(req, url)) return sendJson(res, 401, { ok: false, error: 'Não autorizado' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    res.write(`data: ${JSON.stringify(state())}\n\n`);
    streams.add(res);
    const beat = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) { /* ignore */ } }, 25000);
    req.on('close', () => { clearInterval(beat); streams.delete(res); });
    return undefined;
  }

  if (p.startsWith('/api/')) return sendJson(res, 404, { ok: false, error: 'Rota não encontrada' });

  return serveStatic(res, p);
}

function serveStatic(res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, ''));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'proibido', 'text/plain; charset=utf-8');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'não encontrado', 'text/plain; charset=utf-8');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const cache = file.endsWith('sw.js') ? 'no-store' : 'no-cache';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  route(req, res, url).catch(e => {
    console.error('[server] erro:', e);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Erro interno' });
  });
});

ws.attach(server, {
  path: '/print',
  authorize: (req, url) => authorized(req, url),
  onJob: (job) => printer.sendJob(job),
});

server.listen(PORT, '0.0.0.0', () => {
  const s = db.get().settings;
  const nets = require('os').networkInterfaces();
  const lan = [];
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) lan.push(n.address);
    }
  }
  console.log(`[bloco] ${s.defaultLimit} min de prazo padrão · PIN ${s.pin}`);
  console.log(`[bloco] neste computador: http://localhost:${PORT}`);
  for (const ip of lan) console.log(`[bloco] no celular (mesma rede): http://${ip}:${PORT}`);
  if (process.env.SMOKE) {
    setTimeout(() => {
      console.log('[bloco] SMOKE OK, encerrando');
      process.exit(0);
    }, 400);
  }
});

module.exports = { server };
