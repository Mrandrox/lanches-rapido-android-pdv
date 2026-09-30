'use strict';

const db = require('./db');

const MAX_BATCH = 200;
const ORDER_STATUSES = new Set(['open', 'preparing', 'paused', 'done', 'canceled']);
const NOTE_COLORS = new Set(['amarelo', 'verde', 'azul', 'rosa', 'cinza']);

function requiredText(value, label, max, allowEmpty = false) {
  const text = String(value == null ? '' : value).trim();
  if (!allowEmpty && !text) throw new Error(`${label} é obrigatório.`);
  return text.slice(0, max);
}

function orderInput(entry) {
  const record = entry && entry.record;
  if (!record || typeof record !== 'object') throw new Error('Pedido inválido na sincronização.');
  const customer = record.customer && typeof record.customer === 'object' ? record.customer : {};
  const type = customer.type === 'entrega' ? 'entrega' : 'retirada';
  const address = requiredText(customer.address, 'Endereço', 240, true);
  if (type === 'entrega' && !address) throw new Error('Pedido de entrega sem endereço.');
  const items = Array.isArray(record.items) ? record.items : [];
  if (!items.length || items.length > 100) throw new Error('O pedido deve conter de 1 a 100 itens.');
  const normalizedItems = items.map(item => {
    const name = requiredText(item && item.name, 'Nome do item', 100);
    const qty = Math.max(1, Math.min(9999, parseInt(item.qty, 10) || 1));
    const price = Number(String(item.price == null ? '0' : item.price).replace(',', '.'));
    if (!Number.isFinite(price) || price < 0 || price > 100000000) throw new Error('Preço inválido no pedido.');
    return { name, qty, price };
  });
  const requestedStatus = record.mobileStatus || record.status;
  const status = ORDER_STATUSES.has(requestedStatus) ? requestedStatus : 'open';
  const createdAt = record.createdAt && Number.isFinite(Date.parse(record.createdAt))
    ? new Date(record.createdAt).toISOString()
    : new Date().toISOString();
  const startedAt = record.startedAt && Number.isFinite(Date.parse(record.startedAt))
    ? new Date(record.startedAt).toISOString()
    : null;
  return {
    syncId: requiredText(entry.syncId, 'Identificador local', 120),
    serverId: requiredText(entry.serverId, 'Identificador do servidor', 120, true),
    record: {
      items: normalizedItems,
      note: requiredText(record.note, 'Observação', 500, true),
      payment: requiredText(record.payment, 'Forma de pagamento', 40, true) || 'A combinar',
      limitMin: Math.max(1, Math.min(1440, Math.round(Number(record.limitMin) || 20))),
      accumMs: Math.max(0, Math.min(Number(record.accumMs) || 0, 315360000000)),
      startedAt: status === 'preparing' ? startedAt || new Date().toISOString() : null,
      doneAt: status === 'done' || status === 'canceled' ? record.doneAt || record.canceledAt || new Date().toISOString() : null,
      canceledAt: status === 'canceled' ? record.canceledAt || new Date().toISOString() : null,
      createdAt,
      customer: {
        name: requiredText(customer.name, 'Cliente', 80, true) || 'Balcão',
        phone: requiredText(customer.phone, 'Telefone', 30, true),
        type,
        address,
      },
    },
  };
}

function noteInput(entry) {
  const record = entry && entry.record;
  if (!record || typeof record !== 'object') throw new Error('Lembrete inválido na sincronização.');
  return {
    syncId: requiredText(entry.syncId, 'Identificador local', 120),
    serverId: requiredText(entry.serverId, 'Identificador do servidor', 120, true),
    record: {
      text: requiredText(record.text, 'Texto do lembrete', 500),
      color: NOTE_COLORS.has(record.color) ? record.color : 'amarelo',
      done: !!record.done,
      createdAt: record.createdAt && Number.isFinite(Date.parse(record.createdAt))
        ? new Date(record.createdAt).toISOString()
        : new Date().toISOString(),
    },
  };
}

function uniqueMatch(records, serverId, syncId) {
  const byServer = serverId ? records.find(record => record.id === serverId) : null;
  const bySync = records.find(record => record.androidSyncId === syncId);
  if (byServer && bySync && byServer !== bySync) {
    throw new Error('Os identificadores apontam para registros diferentes; revise a sincronização.');
  }
  return byServer || bySync || null;
}

function applyOrder(entry) {
  const orders = db.get().orders;
  const existing = uniqueMatch(orders, entry.serverId, entry.syncId);
  if (existing) {
    const oldId = existing.id;
    const oldNumber = existing.number;
    const oldCode = existing.code;
    const printedAt = existing.printedAt || null;
    const printCount = existing.printCount || 0;
    Object.assign(existing, entry.record, {
      id: oldId,
      number: oldNumber,
      code: oldCode,
      androidSyncId: entry.syncId,
      printedAt,
      printCount,
    });
    return { syncId: entry.syncId, serverId: existing.id };
  }

  const order = db.createOrder({
    items: entry.record.items,
    limitMin: entry.record.limitMin,
    note: entry.record.note,
    payment: entry.record.payment,
    customer: entry.record.customer,
  });
  Object.assign(order, entry.record, { androidSyncId: entry.syncId });
  return { syncId: entry.syncId, serverId: order.id };
}

function applyNote(entry) {
  const notes = db.get().notes;
  const byServer = entry.serverId ? notes.find(note => note.id === entry.serverId) : null;
  const bySync = notes.find(note => note.androidSyncId === entry.syncId);
  if (byServer && bySync && byServer !== bySync) {
    throw new Error('Os identificadores apontam para lembretes diferentes; revise a sincronização.');
  }
  const existing = byServer || bySync;
  if (existing) {
    const id = existing.id;
    const number = existing.number;
    Object.assign(existing, entry.record, { id, number, androidSyncId: entry.syncId });
    return { syncId: entry.syncId, serverId: id };
  }
  const note = {
    id: db.uid(),
    number: (db.get().counters.note = (db.get().counters.note || 0) + 1),
    ...entry.record,
    androidSyncId: entry.syncId,
  };
  notes.unshift(note);
  return { syncId: entry.syncId, serverId: note.id };
}

function sync(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Conteúdo de sincronização inválido.');
  const orders = Array.isArray(payload.orders) ? payload.orders : [];
  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  if (orders.length > MAX_BATCH || notes.length > MAX_BATCH) {
    throw new Error(`Envie no máximo ${MAX_BATCH} pedidos e ${MAX_BATCH} lembretes por vez.`);
  }

  const normalizedOrders = orders.map(orderInput);
  const normalizedNotes = notes.map(noteInput);
  const orderIds = new Set();
  const noteIds = new Set();
  for (const entry of normalizedOrders) {
    if (orderIds.has(entry.syncId)) throw new Error('O lote contém identificadores de pedidos repetidos.');
    orderIds.add(entry.syncId);
  }
  for (const entry of normalizedNotes) {
    if (noteIds.has(entry.syncId)) throw new Error('O lote contém identificadores de lembretes repetidos.');
    noteIds.add(entry.syncId);
  }
  const orderServerIds = new Set();
  for (const entry of normalizedOrders) {
    if (entry.serverId && orderServerIds.has(entry.serverId)) {
      throw new Error('O lote contém identificadores de servidor repetidos.');
    }
    if (entry.serverId) orderServerIds.add(entry.serverId);
    uniqueMatch(db.get().orders, entry.serverId, entry.syncId);
  }
  const noteServerIds = new Set();
  for (const entry of normalizedNotes) {
    if (entry.serverId && noteServerIds.has(entry.serverId)) {
      throw new Error('O lote contém identificadores de servidor repetidos.');
    }
    if (entry.serverId) noteServerIds.add(entry.serverId);
    const byServer = entry.serverId ? db.get().notes.find(note => note.id === entry.serverId) : null;
    const bySync = db.get().notes.find(note => note.androidSyncId === entry.syncId);
    if (byServer && bySync && byServer !== bySync) {
      throw new Error('Os identificadores apontam para lembretes diferentes; revise a sincronização.');
    }
  }

  const orderMappings = normalizedOrders.map(applyOrder);
  const noteMappings = normalizedNotes.map(applyNote);
  if (orderMappings.length || noteMappings.length) db.save('mobile-sync');
  return { orders: orderMappings, notes: noteMappings };
}

module.exports = { sync };
