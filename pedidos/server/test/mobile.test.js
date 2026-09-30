'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

let server;
let baseUrl;
let tempDir;
let token;

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '1234' }),
      });
      if (response.ok) return response.json();
    } catch { /* Server is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('O servidor de teste não iniciou.');
}

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'X-Token': token } : {}),
      ...options.headers,
    },
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bloco-mobile-test-'));
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, PORT: String(port), DB_PATH: path.join(tempDir, 'data.json') },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const credentials = await waitForServer();
  token = credentials.token;
});

after(async () => {
  if (server && server.exitCode == null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

test('bloqueia sincronização e impressão sem token', async () => {
  const response = await fetch(`${baseUrl}/api/mobile/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orders: [], notes: [] }),
  });
  assert.equal(response.status, 401);
});

test('sincroniza por identificador estável sem duplicar e rejeita dados inválidos', async () => {
  const entry = {
    syncId: 'device-a-order-1',
    serverId: null,
    record: {
      mobileStatus: 'open',
      items: [{ name: 'X-Burger', qty: 2, price: 15 }],
      note: 'Sem cebola',
      payment: 'Pix',
      limitMin: 20,
      accumMs: 0,
      startedAt: null,
      doneAt: null,
      customer: { name: 'Ana', phone: '', type: 'retirada', address: '' },
      createdAt: new Date().toISOString(),
    },
  };

  const first = await api('/api/mobile/sync', {
    method: 'POST',
    body: JSON.stringify({ orders: [entry], notes: [] }),
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.orders.length, 1);
  const serverId = first.body.orders[0].serverId;

  const repeated = await api('/api/mobile/sync', {
    method: 'POST',
    body: JSON.stringify({ orders: [{ ...entry, serverId }], notes: [] }),
  });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.orders[0].serverId, serverId);

  const updated = await api('/api/mobile/sync', {
    method: 'POST',
    body: JSON.stringify({
      orders: [{
        ...entry,
        serverId,
        record: { ...entry.record, note: 'Atualizado pelo celular' },
      }],
      notes: [{ syncId: 'device-a-note-1', serverId: null, record: { text: 'Ligar fornecedor', color: 'verde', done: false } }],
    }),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.orders[0].serverId, serverId);

  const state = await api('/api/state');
  assert.equal(state.status, 200);
  assert.equal(state.body.orders.filter(order => order.androidSyncId === entry.syncId).length, 1);
  assert.equal(state.body.orders.find(order => order.id === serverId).note, 'Atualizado pelo celular');
  assert.equal(state.body.notes.filter(note => note.androidSyncId === 'device-a-note-1').length, 1);

  const invalid = await api('/api/mobile/sync', {
    method: 'POST',
    body: JSON.stringify({ orders: [{ ...entry, record: { ...entry.record, customer: { ...entry.record.customer, type: 'entrega', address: '' } } }] }),
  });
  assert.equal(invalid.status, 400);
  const afterInvalid = await api('/api/state');
  assert.equal(afterInvalid.body.orders.filter(order => order.androidSyncId === entry.syncId).length, 1);
});

test('encaminha erro amigável se a impressora ainda não foi configurada', async () => {
  const response = await api('/api/mobile/print', {
    method: 'POST',
    body: JSON.stringify({ data: Buffer.from('test').toString('base64'), copies: 1 }),
  });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Configure o IP da impressora/);
});

test('encaminha bytes ESC/POS para a impressora de rede configurada', async () => {
  const printer = net.createServer();
  const port = await freePort();
  let printed = Buffer.alloc(0);
  const received = new Promise((resolve, reject) => {
    printer.on('error', reject);
    printer.on('connection', socket => {
      socket.on('data', chunk => { printed = Buffer.concat([printed, chunk]); });
      socket.on('end', resolve);
    });
  });
  await new Promise((resolve, reject) => printer.listen(port, '127.0.0.1', resolve).once('error', reject));
  try {
    const configured = await api('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ settings: { printer: { mode: 'rede', ip: '127.0.0.1', port, proto: 'tcp' } } }),
    });
    assert.equal(configured.status, 200);
    const receipt = Buffer.from([0x1b, 0x40, 0x50, 0x45, 0x44, 0x49, 0x44, 0x4f, 0x0a]);
    const response = await api('/api/mobile/print', {
      method: 'POST',
      body: JSON.stringify({ data: receipt.toString('base64'), copies: 1 }),
    });
    assert.equal(response.status, 200);
    await received;
    assert.deepEqual(printed, receipt);
  } finally {
    await new Promise(resolve => printer.close(resolve));
  }
});
