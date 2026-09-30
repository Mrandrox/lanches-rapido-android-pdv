(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const pad2 = (n) => String(n).padStart(2, '0');

  function hm(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return `${h}:${pad2(m)}:${pad2(s)}`;
    return `${m}:${pad2(s)}`;
  }

  function clock(iso) {
    try {
      return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function dayKey(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  // ---------------- estado ----------------
  let token = localStorage.getItem('bloco-token') || '';
  let S = null;
  let orders = [];
  let notes = [];
  let view = 'pedidos';
  let filter = 'ativos';
  let editingId = null;
  let warnColor = 'amarelo';
  let bt = { device: null, server: null, char: null };
  let ws = null;
  const pending = new Map();
  let wsSeq = 0;
  let ev = null;
  let audio = null;
  let alertOpen = false;

  // ---------------- utilidades ----------------
  function push(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  async function api(path, opts) {
    const o = Object.assign({ headers: { 'Content-Type': 'application/json', 'x-token': token } }, opts || {});
    if (o.body && typeof o.body !== 'string') o.body = JSON.stringify(o.body);
    const res = await fetch(path, o);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { logout(); throw new Error(data.error || 'Sessão expirada'); }
    if (!res.ok) throw new Error(data.error || 'Erro no servidor');
    return data;
  }

  function beep(pattern) {
    if (!S || !S.settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const now = audio.currentTime;
      (pattern || [[0, 0.16], [0.22, 0.16], [0.44, 0.3]]).forEach(([at, dur]) => {
        const osc = audio.createOscillator();
        const g = audio.createGain();
        osc.type = 'square';
        osc.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, now + at);
        g.gain.exponentialRampToValueAtTime(0.25, now + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
        osc.connect(g).connect(audio.destination);
        osc.start(now + at);
        osc.stop(now + at + dur + 0.02);
      });
    } catch (e) { /* audio bloqueado */ }
  }

  function buzz(pattern) {
    if (!S || !S.settings.vibrate) return;
    try { navigator.vibrate(pattern || [220, 120, 220, 120, 500]); } catch (e) { /* ignore */ }
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => legacyCopy(text));
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  // ---------------- cronômetro ----------------
  function elapsedOf(o) {
    if (o.startedAt) return (o.accumMs || 0) + (Date.now() - new Date(o.startedAt).getTime());
    return o.accumMs || 0;
  }

  function statusOf(o) {
    if (o.doneAt) return 'done';
    if (!o.startedAt) return 'wait';
    const e = elapsedOf(o);
    if (e >= o.limitMin * 60000) return 'late';
    if (e >= o.limitMin * 60000 * 0.8) return 'warn';
    return 'run';
  }

  const activeOrders = () => orders.filter(o => !o.doneAt);
  const lateOrders = () => orders.filter(o => statusOf(o) === 'late');

  function tick() {
    for (const el of $$('.ocard')) {
      const o = orders.find(x => x.id === el.dataset.id);
      if (!o) continue;
      const st = statusOf(o);
      el.className = 'ocard s-' + st;
      paintTimer(el, o);
      checkAlert(o, elapsedOf(o), st);
    }
    renderLateBar();
  }

  function paintTimer(el, o) {
    const e = elapsedOf(o);
    const diff = o.limitMin * 60000 - e;
    const tm = $('.timer b', el);
    if (tm) tm.textContent = hm(e);
    const left = $('.timer .left', el);
    if (left) {
      left.textContent = o.doneAt ? `concluído em ${hm(e)}`
        : !o.startedAt ? `prazo ${o.limitMin} min`
          : diff > 0 ? `faltam ${hm(diff)}` : `atrasado ${hm(-diff)}`;
    }
    const bar = $('.bar i', el);
    if (bar) bar.style.width = Math.min(100, (e / (o.limitMin * 60000)) * 100) + '%';
  }

  const alertedHere = new Set();
  const preAlertedAt = new Map();

  function checkAlert(o, e, st) {
    if (o.doneAt || alertedHere.has(o.id)) return;
    const limit = o.limitMin * 60000;
    if (st === 'late') {
      alertedHere.add(o.id);
      const wait = Math.round((e - limit) / 60000);
      const txt = `Pedido ${o.code} — ${o.customer.name}${wait > 0 ? ` (${wait} min além do prazo)` : ''}`;
      beep();
      buzz();
      notify(`⏰ ${o.code} atrasado!`, `${o.customer.name} · ${hm(e)} de ${o.limitMin} min`);
      showAlert(`Pedido ${o.code} atrasou!`, `${o.customer.name} passou de ${o.limitMin} minutos.${wait > 0 ? ` Já ${wait} min de atraso.` : ''}`);
    } else if (S.settings.preAlert && e >= limit - 120000) {
      const last = preAlertedAt.get(o.id) || 0;
      if (Date.now() - last < 300000) return;
      preAlertedAt.set(o.id, Date.now());
      beep([[0, 0.1], [0.16, 0.1]]);
    }
  }

  function notify(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification(title, { body, icon: '/icon.svg', tag: 'bloco-pedidos' }); } catch (e) { /* ignore */ }
  }

  function showAlert(title, text) {
    if (alertOpen) return;
    alertOpen = true;
    $('#alertTitle').textContent = title;
    $('#alertText').textContent = text;
    $('#alertModal').hidden = false;
    beep([[0, 0.12], [0.18, 0.12]]);
  }

  function renderLateBar() {
    const bar = $('#latebar');
    const late = lateOrders();
    const warn = orders.filter(o => statusOf(o) === 'warn');
    const running = activeOrders().length;
    if (!running) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    bar.className = 'latebar' + (late.length ? ' pulse' : warn.length ? ' near' : ' calm');
    $('#lateText').textContent = late.length
      ? `⏰ ${late.length} pedido(s) ATRASADO(s): ${late.map(o => o.code).join(', ')}`
      : warn.length
        ? `⚠️ ${warn.length} perto do prazo: ${warn.map(o => o.code).join(', ')}`
        : `✅ ${running} pedido(s) em dia — prazo padrão ${S.settings.defaultLimit} min`;
  }

  // ---------------- pedidos ----------------
  const RANK = { late: 0, warn: 1, run: 2, wait: 3, done: 4 };

  function filtered() {
    if (filter === 'atrasados') return orders.filter(o => statusOf(o) === 'late' || statusOf(o) === 'warn');
    if (filter === 'espera') return orders.filter(o => !o.startedAt && !o.doneAt);
    if (filter === 'finalizados') return orders.filter(o => o.doneAt);
    return activeOrders()
      .slice()
      .sort((a, b) => (RANK[statusOf(a)] - RANK[statusOf(b)]) || (new Date(b.createdAt) - new Date(a.createdAt)));
  }

  function renderOrders() {
    const box = $('#orders');
    const list = filtered();
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = `<div class="empty">${filter === 'atrasados' ? 'Nenhum pedido atrasado 👍' : 'Nada por aqui. Toque em <b>Novo</b> para lançar um pedido.'}</div>`;
      return;
    }
    for (const o of list) box.appendChild(orderCard(o));
  }

  function orderCard(o) {
    const st = statusOf(o);
    const total = (o.items || []).reduce((a, i) => a + i.qty * i.price, 0);
    const c = o.customer;
    const div = document.createElement('article');
    div.className = 'ocard s-' + st;
    div.dataset.id = o.id;
    const tags = [];
    if (c.type === 'entrega') tags.push('<span class="tag">🛵 Entrega</span>');
    else tags.push('<span class="tag">🥡 Retirada</span>');
    if (o.printedAt) tags.push(`<span class="tag print">🖨 ${o.printCount || 1}</span>`);
    if (st === 'late') tags.push('<span class="tag late">ATRASADO</span>');
    if (st === 'warn') tags.push('<span class="tag warn">perto do prazo</span>');
    if (st === 'run') tags.push('<span class="tag run">em preparo</span>');
    if (o.doneAt) tags.push('<span class="tag">concluído</span>');

    div.innerHTML = `
      <div class="o-top">
        <span class="o-code">${esc(o.code)}</span>
        <span class="o-tags">${tags.join('')}</span>
      </div>
      <div class="timer"><b>${hm(elapsedOf(o))}</b><span class="of">/ ${o.limitMin} min</span><span class="left"></span></div>
      <div class="bar"><i style="width:0%"></i></div>
      <div class="o-cust">
        <b>${esc(c.name)}</b>${c.phone ? ` <span class="sub">· ${esc(c.phone)}</span>` : ''}
        ${c.type === 'entrega' && c.address ? `<div class="sub">🛵 ${esc(c.address)}</div>` : ''}
      </div>
      <ul class="o-items">${(o.items || []).map(i => `<li><b>${i.qty}×</b><span>${esc(i.name)}</span>${i.price ? `<span class="sub" style="margin-left:auto">${money(i.qty * i.price)}</span>` : ''}</li>`).join('')}</ul>
      ${o.note ? `<div class="o-note">📝 ${esc(o.note)}</div>` : ''}
      <div class="o-total"><span>${esc(o.payment)} · ${clock(o.createdAt)}</span><b>${total ? money(total) : 'sem valor'}</b></div>
      <div class="o-acts"></div>`;

    const acts = $('.o-acts', div);
    const main = document.createElement('button');
    main.className = 'btn primary';
    if (st === 'wait') { main.textContent = '▶ Iniciar preparo'; main.onclick = () => act(o.id, 'start'); }
    else if (st === 'done') { main.textContent = '↺ Reabrir'; main.onclick = () => act(o.id, 'done'); }
    else { main.textContent = '✔ Concluir'; main.className = 'btn ok'; main.onclick = () => act(o.id, 'done'); }
    acts.appendChild(main);

    const imp = document.createElement('button');
    imp.className = 'btn';
    imp.textContent = '🖨️ Imprimir';
    imp.onclick = () => printOrder(o.id);
    acts.appendChild(imp);

    const more = document.createElement('button');
    more.className = 'btn ghost';
    more.textContent = '⋯';
    more.onclick = () => openMenu(o);
    acts.appendChild(more);
    paintTimer(div, o);
    return div;
  }

  function openMenu(o) {
    const body = $('#sheetBody');
    const menu = [
      ['⏸ Pausar / retomar cronômetro', () => act(o.id, o.startedAt ? 'pause' : 'resume')],
      ['⏱ Definir prazo (agora: ' + o.limitMin + ' min)', () => askLimit(o)],
      ['⏱ +5 min no prazo', () => act(o.id, 'limit', o.limitMin + 5)],
      ['↺ Zerar cronômetro', () => act(o.id, 'reset')],
      ['✏️ Editar pedido', () => editOrder(o.id)],
      ['📋 Copiar texto (WhatsApp)', () => copyText(orderText(o)).then(ok => push(ok ? 'Texto copiado — cole no WhatsApp' : 'Copie manualmente abaixo'))],
      ['💬 Mandar no WhatsApp', () => sendWhatsApp(o)],
      ['🖨️ Imprimir (58mm)', () => printOrder(o.id)],
      ['🗑️ Excluir pedido', () => removeOrder(o.id)],
    ];
    body.innerHTML = `<h3>Pedido ${esc(o.code)}</h3><div class="menu-list"></div>`;
    const list = $('.menu-list', body);
    for (const [label, fn] of menu) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = label;
      b.onclick = () => { closeSheet(); fn(); };
      list.appendChild(b);
    }
    const cancel = document.createElement('button');
    cancel.className = 'btn ghost';
    cancel.textContent = 'Fechar';
    cancel.onclick = closeSheet;
    list.appendChild(cancel);
    $('#sheetModal').hidden = false;
  }

  function closeSheet() { $('#sheetModal').hidden = true; }

  function askLimit(o) {
    const v = prompt(`Prazo do pedido ${o.code} (minutos):`, o.limitMin);
    if (v === null) return;
    const n = parseInt(v, 10);
    if (n > 0) act(o.id, 'limit', n);
  }

  async function act(id, action, value) {
    try {
      await api(`/api/orders/${id}`, { method: 'PATCH', body: { action, value } });
    } catch (e) { push(e.message); }
  }

  async function removeOrder(id) {
    const o = orders.find(x => x.id === id);
    if (!o || !confirm(`Excluir o pedido ${o.code}?`)) return;
    try { await api(`/api/orders/${id}`, { method: 'DELETE' }); } catch (e) { push(e.message); }
  }

  // ---------------- texto para o WhatsApp ----------------
  function orderText(o) {
    const c = o.customer;
    const L = [];
    L.push(`*${o.code}* — ${c.name}${c.phone ? ` (${c.phone})` : ''}`);
    L.push(`*${c.type === 'entrega' ? 'Entrega' : 'Retirada'}*${c.type === 'entrega' && c.address ? `: ${c.address}` : ''}`);
    for (const i of o.items) L.push(`${i.qty}x ${i.name}${i.price ? ` — ${money(i.qty * i.price)}` : ''}`);
    if (o.note) L.push(`_obs: ${o.note}_`);
    const total = (o.items || []).reduce((a, i) => a + i.qty * i.price, 0);
    if (total) L.push(`*Total: ${money(total)}* — ${o.payment}`);
    L.push(`Feito às ${clock(o.createdAt)} · prazo ${o.limitMin} min`);
    return L.join('\n');
  }

  function waNumber(o) {
    const d = String(o.customer.phone || '').replace(/\D/g, '');
    if (!d) return '';
    return d.startsWith('55') ? d : '55' + d;
  }

  function customerMessage(o) {
    const tpl = (S && S.settings.waMessage) || '';
    const mins = o.limitMin;
    return tpl
      .replace(/\{code\}/g, o.code)
      .replace(/\{time\}/g, mins + ' minutos')
      .replace(/\{total\}/g, money((o.items || []).reduce((a, i) => a + i.qty * i.price, 0)));
  }

  function sendWhatsApp(o) {
    const num = waNumber(o);
    const text = encodeURIComponent(customerMessage(o) || orderText(o));
    const url = num
      ? `https://wa.me/${num}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  }

  // ---------------- formulário ----------------
  function addItemRow(item) {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `
      <input class="qty" type="number" inputmode="numeric" min="1" value="${item ? item.qty : 1}" aria-label="quantidade">
      <input class="name" placeholder="Ex.: 2x Hamburger" value="${esc(item ? item.name : '')}">
      <input class="price" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0,00" value="${item ? item.price || '' : ''}" aria-label="preço">
      <button class="del" type="button" aria-label="remover">✕</button>`;
    $('.del', row).onclick = () => { row.remove(); totalForm(); };
    $('.name', row).oninput = totalForm;
    $('.price', row).oninput = totalForm;
    $('#items').appendChild(row);
    if (!item) $('.name', row).focus();
    totalForm();
    return row;
  }

  function totalForm() {
    let t = 0;
    for (const row of $$('#items .item')) {
      const q = parseInt($('.qty', row).value, 10) || 0;
      const p = parseFloat(String($('.price', row).value).replace(',', '.')) || 0;
      t += q * p;
    }
    $('#fTotal').textContent = money(t);
  }

  function resetForm() {
    editingId = null;
    $('#formId').value = '';
    $('#formTitle').textContent = 'Novo pedido';
    $('#btnCancelEdit').hidden = true;
    $('#fName').value = '';
    $('#fPhone').value = '';
    $('#fAddress').value = '';
    $('#fNote').value = '';
    $('#fPayment').value = 'Pix';
    $('#fLimit').value = S ? S.settings.defaultLimit : 20;
    $('#items').innerHTML = '';
    segType('retirada');
    addItemRow();
    totalForm();
  }

  function editOrder(id) {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    editingId = id;
    $('#formId').value = id;
    $('#formTitle').textContent = `Editar pedido ${o.code}`;
    $('#btnCancelEdit').hidden = false;
    $('#fName').value = o.customer.name;
    $('#fPhone').value = o.customer.phone;
    segType(o.customer.type);
    $('#fAddress').value = o.customer.address;
    $('#fNote').value = o.note;
    $('#fPayment').value = o.payment;
    $('#fLimit').value = o.limitMin;
    $('#items').innerHTML = '';
    (o.items || []).forEach(i => addItemRow(i));
    if (!(o.items || []).length) addItemRow();
    totalForm();
    go('novo');
  }

  function segType(t) {
    $$('#segType button').forEach(b => b.classList.toggle('active', b.dataset.t === t));
    $('#addrWrap').hidden = t !== 'entrega';
  }

  function formData() {
    const items = $$('#items .item').map(r => ({
      qty: parseInt($('.qty', r).value, 10) || 1,
      name: $('.name', r).value.trim(),
      price: parseFloat(String($('.price', r).value).replace(',', '.')) || 0,
    })).filter(i => i.name);
    return {
      items,
      note: $('#fNote').value,
      payment: $('#fPayment').value,
      limitMin: parseInt($('#fLimit').value, 10) || 20,
      customer: {
        name: $('#fName').value.trim(),
        phone: $('#fPhone').value.trim(),
        type: $('#segType button.active').dataset.t,
        address: $('#fAddress').value.trim(),
      },
    };
  }

  async function save(andPrint) {
    const data = formData();
    if (!data.items.length) return push('Adicione ao menos um item.');
    if (!data.customer.name) return push('Informe o nome do cliente.');
    try {
      if (editingId) {
        await api(`/api/orders/${editingId}`, { method: 'PATCH', body: { action: 'update', value: data } });
        await api(`/api/orders/${editingId}`, { method: 'PATCH', body: { action: 'limit', value: data.limitMin } });
        push('Pedido atualizado');
        resetForm();
        go('pedidos');
        if (andPrint) printOrder(editingId);
        return;
      }
      const res = await api('/api/orders', { method: 'POST', body: data });
      resetForm();
      go('pedidos');
      push(`Pedido ${res.order.code} criado · prazo ${res.order.limitMin} min`);
      if (andPrint) printOrder(res.order.id);
    } catch (e) { push(e.message); }
  }

  // ---------------- importar do WhatsApp ----------------
  const cleanItem = (s) => String(s).replace(/^[-*•]\s*/, '').replace(/^d[eev]\s+/i, '').trim();

  function importWhatsApp() {
    const text = $('#waText').value.trim();
    if (!text) return push('Cole a mensagem do cliente primeiro.');
    const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);

    const phoneMatch = text.match(/(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}/);
    if (phoneMatch) $('#fPhone').value = phoneMatch[0].trim();

    const addrIdx = lines.findIndex(l => /\b(rua|av\.?|avenida|travessa|estrada|rodovia|endereço|endereco|entrega:|morar|moro)\b/i.test(l));
    if (addrIdx >= 0) {
      segType('entrega');
      $('#fAddress').value = lines[addrIdx].replace(/^.*?:\s*/, '');
    }

    const items = [];
    const notes = [];
    let name = '';
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (i === addrIdx) continue;
      if (phoneMatch && l === phoneMatch[0].trim()) continue;
      if (/^(obs|observ|observa|recado)\b[:.]/i.test(l)) { notes.push(l.replace(/^[^:.]*[:.]?\s*/, '')); continue; }
      if (!name && !/\d/.test(l) && !/^\s*[-*]/.test(l) && l.split(/\s+/).length <= 5) { name = l.replace(/[:\-–]/g, '').trim(); continue; }
      const wordQty = l.match(/^(\d{1,2}\s+)?(meia\s+d[uú]zia|d[uú]zia)\s+(.{2,})$/i)
        || l.match(/^(meia\s+d[uú]zia|d[uú]zia)\s+(.{2,})$/i);
      const numQty = l.match(/^(\d{1,2})\s*(?:x|X|\*)?\s+(.{2,})$/);
      if (wordQty) {
        const n = wordQty[1] ? parseInt(wordQty[1], 10) : 1;
        const qty = /^meia/i.test(wordQty[2]) ? Math.round(n * 6) : n * 12;
        items.push({ qty, name: cleanItem(wordQty[3]) });
      } else if (numQty) {
        let qty = parseInt(numQty[1], 10);
        let label = numQty[2];
        const duzia = label.match(/^(meia\s+d[uú]zia|d[uú]zia)\s+(.{2,})$/i);
        if (duzia) {
          qty *= /^meia/i.test(duzia[1]) ? 6 : 12;
          label = duzia[2];
        }
        items.push({ qty, name: cleanItem(label) });
      } else if (items.length && l.length < 40 && !/\d{2,}/.test(l)) {
        items[items.length - 1].name += ' ' + cleanItem(l);
      } else if (l.length > 1) {
        items.push({ qty: 1, name: cleanItem(l) });
      }
    }
    if (name && !$('#fName').value) $('#fName').value = name;
    if (notes.length && !$('#fNote').value) $('#fNote').value = notes.join(' · ');
    if (items.length) {
      $('#items').innerHTML = '';
      items.forEach(i => addItemRow(i));
      push(`${items.length} item(ns) importado(s) — confira e salve.`);
    } else {
      push('Não entendi os itens — digite à mão.');
    }
    totalForm();
  }

  // ---------------- notas do bloco ----------------
  function renderNotes() {
    const box = $('#notes');
    box.innerHTML = '';
    const open = notes.filter(n => !n.done);
    $('#tabNotes').hidden = !notes.length;
    $('#tabNotes').textContent = open.length;
    $('#tabNotes').className = 'dot count';
    if (!notes.length) {
      box.innerHTML = '<div class="empty">Nenhum lembrete fixado. Escreva acima para não esquecer nada.</div>';
      return;
    }
    for (const n of notes) {
      const d = document.createElement('div');
      d.className = `note ${n.color}${n.done ? ' done' : ''}`;
      d.innerHTML = `<span class="n-x">✕</span>${esc(n.text)}`;
      d.onclick = (e) => {
        if (e.target.classList.contains('n-x')) {
          if (!confirm('Apagar este lembrete?')) return;
          api(`/api/notes/${n.id}`, { method: 'DELETE' }).catch(err => push(err.message));
          return;
        }
        api(`/api/notes/${n.id}`, { method: 'PATCH', body: { done: !n.done } }).catch(err => push(err.message));
      };
      box.appendChild(d);
    }
  }

  async function addNote() {
    const text = $('#noteText').value.trim();
    if (!text) return;
    try {
      await api('/api/notes', { method: 'POST', body: { text, color: warnColor } });
      $('#noteText').value = '';
    } catch (e) { push(e.message); }
  }

  // ---------------- ESC/POS (58mm) ----------------
  const ESC = 0x1b, GS = 0x1d;

  function ascii(t) {
    if (!S.settings.printer.ascii) return String(t);
    return String(t)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[çÇ]/g, c => (c === 'ç' ? 'c' : 'C'))
      .replace(/[ñÑ]/g, c => (c === 'ñ' ? 'n' : 'N'))
      .replace(/[^\x20-\x7e\n]/g, '');
  }

  function fold(t, w) {
    const out = [];
    let line = '';
    for (const word of ascii(t).split(/\s+/)) {
      if (!line.length) line = word;
      else if (line.length + 1 + word.length <= w) line += ' ' + word;
      else { out.push(line); line = word; }
      while (line.length > w) { out.push(line.slice(0, w)); line = line.slice(w); }
    }
    if (line.length) out.push(line);
    return out;
  }

  function buildEscpos(order) {
    const pr = S.settings.printer;
    const W = parseInt(pr.width, 10) || 32;
    const st = S.store;
    const c = order.customer;
    const parts = [];
    const raw = (bytes) => parts.push({ b: bytes });
    const txt = (s) => parts.push({ t: s });

    raw([ESC, 0x40]);
    raw([ESC, 0x61, 0x01]);
    raw([GS, 0x21, 0x11]);
    txt(ascii(st.name || 'PEDIDOS') + '\n');
    if (st.phone) { raw([GS, 0x21, 0x00]); txt(ascii(st.phone) + '\n'); }
    if (st.address) txt(ascii(st.address) + '\n');
    raw([ESC, 0x61, 0x00, ESC, 0x64, 0x02, ESC, 0x45, 0x01, GS, 0x21, 0x11]);
    txt(`PEDIDO ${order.code}\n`);
    raw([GS, 0x21, 0x00, ESC, 0x45, 0x00]);
    txt(`${new Date(order.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}  ${c.type === 'entrega' ? 'ENTREGA' : 'RETIRADA'}\n`);
    txt('-'.repeat(W) + '\n');

    for (const i of order.items || []) {
      const label = `${i.qty}x ${i.name}`;
      for (const l of fold(label, W)) txt(l + '\n');
      if (i.price) txt(' ' + money(i.qty * i.price) + '\n');
    }

    txt('-'.repeat(W) + '\n');
    const total = (order.items || []).reduce((a, i) => a + i.qty * i.price, 0);
    if (total) {
      const head = 'TOTAL';
      txt(head + ' '.repeat(Math.max(1, W - head.length - money(total).length)) + money(total) + '\n');
    }
    if (order.payment) txt(order.payment + '\n');
    txt('-'.repeat(W) + '\n');
    raw([ESC, 0x45, 0x01]);
    for (const l of fold(`Cliente: ${c.name}`, W)) txt(l + '\n');
    if (c.phone) for (const l of fold(`Tel: ${c.phone}`, W)) txt(l + '\n');
    if (c.type === 'entrega' && c.address) for (const l of fold(`End: ${c.address}`, W)) txt(l + '\n');
    raw([ESC, 0x45, 0x00]);
    if (order.note) {
      raw([ESC, 0x45, 0x01]);
      for (const l of fold(`OBS: ${order.note}`, W)) txt(l + '\n');
      raw([ESC, 0x45, 0x00]);
    }
    txt('\n\n\n');
    if (pr.drawer) raw([ESC, 0x70, 0x00, 0x19, 0xfa]);
    if (pr.cut) raw([GS, 0x56, 0x42, 0x00]);

    const enc = new TextEncoder();
    const chunks = [];
    let len = 0;
    for (const p of parts) {
      const u = p.b ? new Uint8Array(p.b) : enc.encode(p.t);
      chunks.push(u);
      len += u.length;
    }
    const all = new Uint8Array(len);
    let off = 0;
    for (const u of chunks) { all.set(u, off); off += u.length; }
    return all;
  }

  function buildTestEscpos() {
    return buildEscpos({
      code: '#000',
      createdAt: new Date().toISOString(),
      customer: { name: 'TESTE DE IMPRESSÃO', type: 'retirada' },
      items: [{ qty: 1, name: 'Se voce leu isso, a impressora esta pronta', price: 0 }],
      payment: '',
      note: '',
    });
  }

  function bytesToB64(bytes) {
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }

  function resolveMode() {
    const m = S.settings.printer.mode;
    if (m !== 'auto') return m;
    if (bt.char) return 'bluetooth';
    if (S.settings.printer.ip) return 'rede';
    return 'sistema';
  }

  async function sendBytes(bytes) {
    const mode = resolveMode();
    const pr = S.settings.printer;
    const copies = Math.max(1, parseInt(pr.copies, 10) || 1);
    if (mode === 'bluetooth') return sendBluetooth(bytes, copies);
    if (mode === 'rede') return sendNetwork(bytes, copies);
    return false;
  }

  async function sendBluetooth(bytes, copies) {
    if (!bt.char) await btConnect();
    const ch = bt.char;
    const withResponse = ch.properties && ch.properties.write;
    for (let c = 0; c < copies; c++) {
      for (let i = 0; i < bytes.length; i += 180) {
        const part = bytes.subarray(i, i + 180);
        if (withResponse) await ch.writeValueWithResponse(part);
        else await ch.writeValue(part);
        await new Promise(r => setTimeout(r, 25));
      }
    }
    return true;
  }

  function wsOpen() {
    if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve(ws);
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/print?token=${encodeURIComponent(token)}`);
      ws.onopen = () => resolve(ws);
      ws.onerror = () => reject(new Error('Não consegui falar com o servidor da rede.'));
      ws.onclose = () => { ws = null; };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg.id && pending.has(msg.id)) {
          const { resolve: res, reject: rej } = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.ok) res(msg); else rej(new Error(msg.error || 'Falha na impressão'));
        }
      };
      setTimeout(() => reject(new Error('Tempo esgotado ao falar com a impressora.')), 20000);
    });
  }

  async function sendNetwork(bytes, copies) {
    const pr = S.settings.printer;
    if (!pr.ip) throw new Error('Informe o IP da impressora em Ajustes.');
    const b64 = bytesToB64(bytes);
    if (pr.proto === 'http') {
      for (let c = 0; c < copies; c++) {
        await api('/api/print-http', { method: 'POST', body: { ip: pr.ip, port: parseInt(pr.port, 10) || 9100, data: b64 } });
      }
      return true;
    }
    const sock = await wsOpen();
    for (let c = 0; c < copies; c++) {
      const id = ++wsSeq;
      await new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        sock.send(JSON.stringify({ id, ip: pr.ip, port: parseInt(pr.port, 10) || 9100, proto: 'tcp', data: b64 }));
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('A impressora não respondeu a tempo.')); } }, 25000);
      });
    }
    return true;
  }

  function printViaSystem(order) {
    const st = S.store;
    const c = order.customer;
    const W = 32;
    const total = (order.items || []).reduce((a, i) => a + i.qty * i.price, 0);
    const lines = [];
    const row = (a, b) => (a + ' '.repeat(Math.max(1, W - a.length - b.length)) + b);
    lines.push(`<div class="c b big">${esc(st.name)}</div>`);
    if (st.phone) lines.push(`<div class="c">${esc(st.phone)}</div>`);
    if (st.address) lines.push(`<div class="c">${esc(st.address)}</div>`);
    lines.push('<div class="ln"></div>');
    lines.push(`<div class="c b">PEDIDO ${esc(order.code)}</div>`);
    lines.push(`<div class="c">${clock(order.createdAt)} · ${c.type === 'entrega' ? 'ENTREGA' : 'RETIRADA'}</div>`);
    lines.push('<div class="ln"></div>');
    for (const i of order.items || []) {
      lines.push(`<div>${i.qty}x ${esc(i.name)}</div>`);
      if (i.price) lines.push(`<div class="r">${money(i.qty * i.price)}</div>`);
    }
    lines.push('<div class="ln"></div>');
    if (total) lines.push(`<div class="r b">${row('TOTAL', money(total))}</div>`);
    if (order.payment) lines.push(`<div class="r">${esc(order.payment)}</div>`);
    lines.push('<div class="ln"></div>');
    lines.push(`<div><b>Cliente:</b> ${esc(c.name)}</div>`);
    if (c.phone) lines.push(`<div><b>Tel:</b> ${esc(c.phone)}</div>`);
    if (c.type === 'entrega' && c.address) lines.push(`<div><b>End:</b> ${esc(c.address)}</div>`);
    if (order.note) lines.push(`<div><b>Obs:</b> ${esc(order.note)}</div>`);
    lines.push('<div class="c" style="margin-top:8px">Obrigado!</div>');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Pedido ${esc(order.code)}</title><style>
      @page { size: 58mm auto; margin: 2mm; }
      body { width: 54mm; margin: 0 auto; color: #000; background: #fff; font-family: "Courier New", monospace; font-size: 11px; line-height: 1.35; }
      .c { text-align: center; } .b { font-weight: 700; } .big { font-size: 16px; }
      .ln { border-top: 1px dashed #000; margin: 6px 0; }
      .r { text-align: right; white-space: pre; }
      </style></head><body>${lines.join('\n')}
      <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) {
      push('Libere os pop-ups do navegador para imprimir.');
      return false;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    return true;
  }

  async function printOrder(id) {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    try {
      const bytes = buildEscpos(o);
      const done = await sendBytes(bytes);
      if (!done) printViaSystem(o);
      await api(`/api/orders/${id}`, { method: 'PATCH', body: { action: 'printed' } }).catch(() => {});
      push(`🖨️ ${o.code} enviado para a impressora`);
    } catch (e) {
      push('Erro: ' + e.message);
    }
  }

  async function printTest() {
    try {
      const bytes = buildTestEscpos();
      const done = await sendBytes(bytes);
      if (!done) {
        const w = window.open('', '_blank');
        if (!w) return push('Libere os pop-ups para imprimir.');
        w.document.write(`<pre style="font-family:'Courier New';width:54mm;margin:0 auto;font-size:12px">${ascii('TESTE DE IMPRESSAO 58mm\n\nSe voce leu isso,\na impressora esta pronta.\n\n- - - - - - - - - - - - - - -\nBloco de Pedidos\n')}</pre><script>window.print()<\/script>`);
        w.document.close();
        return push('Abriu a tela de impressão (escolha a impressora 58mm)');
      }
      push('🖨️ Teste enviado para a impressora');
    } catch (e) { push('Erro: ' + e.message); }
  }

  async function btConnect() {
    if (!navigator.bluetooth) throw new Error('Bluetooth só funciona no Chrome do Android. No iPhone use "IP na rede" ou "Tela de impressão".');
    bt.device = await navigator.bluetooth.requestDevice({ filters: [], optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'] });
    bt.server = await bt.device.gatt.connect();
    const services = await bt.server.getPrimaryServices();
    for (const s of services) {
      let chars = [];
      try { chars = await s.getCharacteristics(); } catch (e) { continue; }
      const c = chars.find(x => x.properties && (x.properties.write || x.properties.writeWithoutResponse));
      if (c) { bt.char = c; break; }
    }
    if (!bt.char) throw new Error('Esta impressora não aceita escrita por Bluetooth. Use a opção "IP na rede".');
    const name = bt.device.name || 'impressora';
    $('#printerStatus').textContent = `Impressora: ${name} conectada via Bluetooth.`;
    push('Conectado: ' + name);
  }

  // ---------------- ajustes ----------------
  function fillSettings() {
    const st = S.store, se = S.settings, pr = se.printer;
    $('#storeName').textContent = st.name || 'Bloco de Pedidos';
    document.title = st.name || 'Bloco de Pedidos';
    $('#sName').value = st.name;
    $('#sPhone').value = st.phone;
    $('#sAddress').value = st.address;
    $('#sLimit').value = se.defaultLimit;
    $('#sPreAlert').checked = !!se.preAlert;
    $('#sSound').checked = !!se.sound;
    $('#sVibrate').checked = !!se.vibrate;
    $('#sWa').value = se.waMessage;
    $('#pMode').value = pr.mode;
    $('#pIp').value = pr.ip;
    $('#pPort').value = pr.port;
    $('#pProto').value = pr.proto;
    $('#pWidth').value = pr.width;
    $('#pCopies').value = pr.copies;
    $('#pCut').checked = !!pr.cut;
    $('#pDrawer').checked = !!pr.drawer;
    $('#pAscii').checked = !!pr.ascii;
    $('#sPin').value = se.pin;
    $('#btnSound').classList.toggle('off', !se.sound);
    $('#netBox').hidden = pr.mode === 'sistema' || pr.mode === 'bluetooth';
    $('#printerStatus').textContent = bt.char
      ? `Impressora: ${bt.device ? bt.device.name : 'conectada'} via Bluetooth.`
      : pr.ip ? `Impressora: ${pr.ip}:${pr.port} (${pr.proto}) — modo ${pr.mode}.` : 'Impressora: ainda não configurada.';
  }

  async function saveSettings() {
    const pr = {
      mode: $('#pMode').value,
      ip: $('#pIp').value.trim(),
      port: parseInt($('#pPort').value, 10) || 9100,
      proto: $('#pProto').value,
      width: parseInt($('#pWidth').value, 10) || 32,
      copies: parseInt($('#pCopies').value, 10) || 1,
      cut: $('#pCut').checked,
      drawer: $('#pDrawer').checked,
      ascii: $('#pAscii').checked,
    };
    const body = {
      store: { name: $('#sName').value.trim(), phone: $('#sPhone').value.trim(), address: $('#sAddress').value.trim() },
      settings: {
        defaultLimit: parseInt($('#sLimit').value, 10) || 20,
        preAlert: $('#sPreAlert').checked,
        sound: $('#sSound').checked,
        vibrate: $('#sVibrate').checked,
        waMessage: $('#sWa').value,
        pin: $('#sPin').value.trim() || '1234',
        printer: pr,
      },
    };
    try {
      await api('/api/settings', { method: 'PATCH', body });
      fillSettings();
      push('Ajustes salvos');
    } catch (e) { push(e.message); }
  }

  // ---------------- sincronização ----------------
  async function boot() {
    $('#lock').hidden = true;
    $('#app').hidden = false;
    try { await loadState(); } catch (e) { return; }
    fillSettings();
    resetForm();
    tick();
    listen();
    if ('Notification' in window && Notification.permission === 'default') {
      $('#btnNotify').onclick = () => Notification.requestPermission().then(p => push(p === 'granted' ? 'Notificações ativadas' : 'Notificações negadas'));
    }
  }

  async function loadState() {
    const st = await api('/api/state');
    applyState(st);
  }

  function applyState(st) {
    S = st;
    orders = st.orders || [];
    notes = st.notes || [];
    syncChrome();
    if (view !== 'ajustes') fillSettings();
    renderOrders();
    renderNotes();
    renderRecent();
    renderLateBar();
  }

  function syncChrome() {
    $('#storeName').textContent = S.store.name || 'Bloco de Pedidos';
    document.title = S.store.name || 'Bloco de Pedidos';
    $('#btnSound').classList.toggle('off', !S.settings.sound);
  }

  function listen() {
    if (ev) ev.close();
    ev = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    ev.onmessage = (e) => {
      try { applyState(JSON.parse(e.data)); } catch (err) { /* ignore */ }
    };
    ev.onerror = () => { /* EventSource reconecta sozinho */ };
  }

  function renderRecent() {
    const seen = new Map();
    for (const o of orders) for (const i of o.items || []) {
      if (!seen.has(i.name)) seen.set(i.name, i.price);
    }
    const box = $('#recentItems');
    box.innerHTML = '';
    for (const [name, price] of Array.from(seen).slice(0, 12)) {
      const b = document.createElement('button');
      b.textContent = name;
      b.onclick = () => {
        const empty = $$('#items .item').find(r => !$('.name', r).value);
        const row = empty || addItemRow();
        $('.name', row).value = name;
        if (price && !$('.price', row).value) $('.price', row).value = price;
        totalForm();
      };
      box.appendChild(b);
    }
  }

  function go(v) {
    view = v;
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
    $$('.view').forEach(s => { s.hidden = s.id !== 'view-' + v; });
    window.scrollTo(0, 0);
  }

  function logout() {
    token = '';
    localStorage.removeItem('bloco-token');
    $('#app').hidden = true;
    $('#lock').hidden = false;
    if (ev) ev.close();
    ev = null;
  }

  async function login() {
    const pin = $('#pin').value.trim();
    if (!pin) return;
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const d = await r.json();
      if (!r.ok) { $('#lockErr').textContent = d.error || 'PIN inválido'; return; }
      token = d.token;
      localStorage.setItem('bloco-token', token);
      $('#lockErr').textContent = '';
      $('#pin').value = '';
      boot();
    } catch (e) { $('#lockErr').textContent = 'Sem conexão com o servidor'; }
  }

  // ---------------- eventos ----------------
  $('#doLogin').onclick = login;
  $('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  $$('.tab').forEach(t => { t.onclick = () => go(t.dataset.view); });
  $$('#filters .chip').forEach(c => {
    c.onclick = () => {
      filter = c.dataset.f;
      $$('#filters .chip').forEach(x => x.classList.toggle('active', x === c));
      renderOrders();
    };
  });
  $$('#segType button').forEach(b => { b.onclick = () => segType(b.dataset.t); });
  $$('.quick-limits button').forEach(b => { b.onclick = () => { $('#fLimit').value = b.dataset.m; }; });
  $$('#noteColors .sw').forEach(s => {
    s.onclick = () => {
      warnColor = s.dataset.c;
      $$('#noteColors .sw').forEach(x => x.classList.toggle('active', x === s));
    };
  });
  $('#btnAddItem').onclick = () => addItemRow();
  $('#btnSave').onclick = () => save(false);
  $('#btnSavePrint').onclick = () => save(true);
  $('#btnCancelEdit').onclick = () => { resetForm(); go('pedidos'); };
  $('#btnImport').onclick = importWhatsApp;
  $('#btnClearPaste').onclick = () => { $('#waText').value = ''; };
  $('#btnAddNote').onclick = addNote;
  $('#noteText').addEventListener('keydown', e => { if (e.key === 'Enter') addNote(); });
  $('#btnPrintNotes').onclick = printNotes;
  $('#btnSettings').onclick = () => go('ajustes');
  $('#btnTest').onclick = printTest;
  $('#btnBt').onclick = () => btConnect().catch(e => push(e.message));
  $('#btnSaveSettings').onclick = saveSettings;
  $('#btnLogout').onclick = logout;
  $('#pMode').onchange = fillSettings;
  $('#btnSound').onclick = async () => {
    const on = !S.settings.sound;
    S.settings.sound = on;
    $('#btnSound').classList.toggle('off', !on);
    try { await api('/api/settings', { method: 'PATCH', body: { settings: { sound: on } } }); } catch (e) { /* ignore */ }
    if (on) beep([[0, 0.08]]);
  };
  $('#alertClose').onclick = () => { $('#alertModal').hidden = true; alertOpen = false; };
  $('#sheetModal').onclick = (e) => { if (e.target.id === 'sheetModal') closeSheet(); };

  function printNotes() {
    const open = notes.filter(n => !n.done);
    if (!open.length) return push('Nenhum lembrete pendente.');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bloco</title><style>
      @page { size: 58mm auto; margin: 2mm; }
      body { width: 54mm; font-family: "Courier New", monospace; font-size: 12px; line-height: 1.5; }
      h1 { text-align: center; font-size: 14px; }
      li { margin-bottom: 6px; }
      </style></head><body><h1>LEMBRETES DO CAIXA</h1><hr>${new Date().toLocaleString('pt-BR')}<hr>
      <ol>${open.map(n => `<li>${esc(n.text)}</li>`).join('')}</ol>
      <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return push('Libere os pop-ups para imprimir.');
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // ---------------- instalação (PWA) ----------------
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    $('#btnInstall').textContent = '📲 Instalar agora';
  });
  $('#btnInstall').onclick = async () => {
    if (deferred) { deferred.prompt(); deferred = null; return; }
    push('No Android: menu do Chrome → "Adicionar à tela inicial". No iPhone: Compartilhar → "Adicionar à Tela de Início".');
  };
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
  document.addEventListener('click', () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* ignore */ } }, { once: true });

  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  if (token) {
    boot().catch(() => logout());
  }
})();
