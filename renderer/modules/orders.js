'use strict';

/* ============================================================
   Pedidos — delivery e balcão com status em tempo real
   ============================================================ */
(function () {
  const App = window.App;
  const st = { filter: 'all', type: 'all', search: '' };
  let deb = null;

  function show() {
    render();
  }

  function refreshUI() {
    clearTimeout(deb);
    deb = setTimeout(() => render(), 120);
  }
  function onEvent(type, payload) {
    if (App.current === 'orders') refreshUI();
  }

  function money(v) { return App.money(v); }

  function render() {
    const root = document.getElementById('screenContent');
    const isCourier = App.user.role === 'courier';
    let orders = App.data.orders.slice();
    if (isCourier) orders = orders.filter(o => o.courierId === App.user.id);
    if (st.type !== 'all') orders = orders.filter(o => o.type === st.type);
    if (st.search) {
      const q = st.search.toLowerCase();
      orders = orders.filter(o => (o.customer || '').toLowerCase().includes(q) || String(o.number).includes(q));
    }
    orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const couriers = App.data.users.filter(u => u.role === 'courier' && u.active !== false);
    const count = (t) => App.data.orders.filter(o => t === 'all' || o.type === t).length;

    root.innerHTML = `
      <div class="row-between wrap mb">
        <div class="filter-tabs" style="margin-bottom:0">
          <button class="f-tab ${st.type === 'all' ? 'active' : ''}" onclick="window.__od.type('all')">Todos (${count('all')})</button>
          <button class="f-tab ${st.type === 'delivery' ? 'active' : ''}" onclick="window.__od.type('delivery')">🚚 Delivery (${count('delivery')})</button>
          <button class="f-tab ${st.type === 'counter' ? 'active' : ''}" onclick="window.__od.type('counter')">🏪 Balcão (${count('counter')})</button>
        </div>
        <input placeholder="🔎 Buscar pedido ou cliente…" value="${App.esc(st.search)}" style="width:220px" oninput="window.__od.search(this.value)">
      </div>
      ${isCourier && !orders.length
        ? '<div class="empty-state"><span class="emoji-big">🛵</span>Nenhuma entrega para você. <br>Peça à loja para atribuir pedidos no app do entregador ou aqui.</div>'
        : ''}
      <div class="order-list">${orders.map(cardFor).join('') || (isCourier ? '' : '<div class="empty-state"><span class="emoji-big">📭</span>Nenhum pedido.</div>')}</div>`;

    // ações
    root.querySelectorAll('[data-act]').forEach(b => b.onclick = () => act(b.dataset.act, b.dataset.id, b));
    root.querySelectorAll('[data-courier]').forEach(sel => sel.onchange = (e) => assignCourier(sel.dataset.courier, e.target.value));
  }

  function statusActions(o, isCourier) {
    if (isCourier && o.courierId !== App.user.id) return '';
    const btns = [];
    if (!isCourier) {
      if (o.status === 'open') btns.push(`<button class="btn" data-act="preparing" data-id="${o.id}">🍳 Preparando</button>`);
      if (o.status === 'preparing' || o.status === 'open') btns.push(`<button class="btn" data-act="cancel" data-id="${o.id}">❌ Cancelar</button>`);
    }
    if ((o.status === 'preparing') && o.type === 'delivery') {
      if (isCourier) btns.push(`<button class="btn btn-primary" data-act="route" data-id="${o.id}">🛵 Iniciar rota</button>`);
    }
    if (!isCourier && (o.status === 'open' || o.status === 'preparing') && o.type === 'delivery') {
      btns.push(`<button class="btn btn-primary" data-act="route" data-id="${o.id}">🛵 Em rota</button>`);
    }
    if (o.status === 'route') btns.push(`<button class="btn btn-primary" data-act="delivered" data-id="${o.id}">✅ Entregue</button>`);
    return btns.join('');
  }

  function cardFor(o) {
    const sA = statusActions(o, App.user.role === 'courier');
    const couriers = App.data.users.filter(u => u.role === 'courier' && u.active !== false);
    const isDelivery = o.type === 'delivery';
    const canAssign = App.user.role !== 'courier' && isDelivery && o.courierId == null && couriers.length;
    const courierSel = canAssign
      ? `<select data-courier="${o.id}">
          <option value="">Atribuir entregador…</option>
          ${couriers.map(c => `<option value="${c.id}" ${o.courierId === c.id ? 'selected' : ''}>${App.esc(c.name)}</option>`).join('')}
        </select>`
      : '';
    const link = isDelivery ? `${App.base}/track/${o.id}` : '';
    const moneyIt = (i) => `${i.qty}× ${App.esc(i.name)} <b>${money(i.total)}</b>`;

    return `
      <div class="order-card st-${o.status}">
        <div class="head">
          <b>#${o.number}</b>
          ${App.badgeForOrder(o)}
          <span class="num" style="margin-left:auto">${App.dt(o.createdAt)}</span>
        </div>
        <div class="muted" style="font-size:13px;margin-bottom:6px">
          ${App.esc(o.customer || 'Consumidor')}${o.phone ? ' · ' + App.esc(o.phone) : ''}
        </div>
        ${isDelivery && o.address ? `<div class="muted" style="font-size:12.5px;margin-bottom:4px">📍 ${App.esc(o.address)}</div>` : ''}
        <ul class="order-items">
          ${o.items.map(i => `<li><span>${moneyIt(i)}</span></li>`).join('')}
        </ul>
        <div class="order-foot">
          <span>Pag. ${App.esc(o.payment)}</span>
          <span>${money(o.total)}</span>
        </div>
        ${o.note ? `<div class="muted" style="font-size:12px;margin-bottom:8px">📝 ${App.esc(o.note)}</div>` : ''}
        <div class="order-actions">
          ${courierSel}
          ${sA}
          <button class="btn" data-act="print" data-id="${o.id}">🖨️ Imprimir</button>
          ${link ? `<button class="btn" data-act="link" data-id="${o.id}">🔗 Rastreio</button>` : ''}
        </div>
      </div>`;
  }

  async function act(kind, id, btn) {
    const o = App.data.orders.find(x => x.id === id);
    if (!o) return;
    try {
      if (kind === 'print') {
        const kindPrint = o.type === 'delivery' ? 'cozinha' : 'venda';
        const res = await App.printOrder(o, kindPrint);
        if (!res) App.toast('Impressão não confirmada.', true);
        return;
      }
      if (kind === 'link') {
        navigator.clipboard.writeText(`${App.base}/track/${id}`);
        App.toast('Link de rastreio copiado! 📋');
        return;
      }
      if (kind === 'cancel') {
        App.api(`/api/orders/${id}/status`, { method: 'POST', body: { status: 'canceled' } });
      } else {
        if (kind === 'route' && o.courierId == null) {
          const couriers = App.data.users.filter(u => u.role === 'courier' && u.active !== false);
          if (couriers.length) {
            await App.api(`/api/orders/${id}/assign`, { method: 'POST', body: { courierId: couriers[0].id } });
          }
        }
        btn.disabled = true;
        await App.api(`/api/orders/${id}/status`, { method: 'POST', body: { status: kind } });
      }
      App.toast('Pedido atualizado ✅');
      await App.refresh();
      refreshUI();
    } catch (e) {
      App.toast(e.message, true);
    }
  }

  async function assignCourier(id, courierId) {
    if (!courierId) return;
    try {
      await App.api(`/api/orders/${id}/assign`, { method: 'POST', body: { courierId } });
      App.toast('Entregador atribuído! 🛵');
      await App.refresh();
      refreshUI();
    } catch (e) { App.toast(e.message, true); }
  }

  window.__od = {
    type(t) { st.type = t; render(); },
    search(v) { st.search = v; render(); },
    act, assignCourier,
  };

  App.registerScreen({
    id: 'orders',
    label: 'Pedidos',
    icon: '📦',
    roles: ['admin', 'operator', 'courier'],
    show,
    onEvent,
  });
})();