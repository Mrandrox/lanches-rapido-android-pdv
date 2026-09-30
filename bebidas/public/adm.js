(() => {
  const $ = (s, el = document) => el.querySelector(s);
  let token = localStorage.getItem('bebiasia-token') || '';
  let orders = [];
  let filter = 'todos';
  let ev = null;

  const STATUS_META = {
    novo: 'Novo',
    preparando: 'Preparando',
    pronto: 'Pronto',
    rota: 'Saiu para entrega',
    entregue: 'Entregue',
    retirado: 'Retirado',
    cancelado: 'Cancelado',
  };
  const NEXT = {
    novo: 'preparando',
    preparando: 'pronto',
    pronto: 'rota',
    rota: 'entregue',
  };

  function money(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
  function fmtTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function push(m) {
    const t = $('#toast');
    t.textContent = m;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 2300);
  }

  // ---------- Login ----------
  async function login() {
    const pin = $('#pin').value.trim();
    if (!pin) return;
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    if (!res.ok) return push(data.error || 'PIN inválido');
    token = data.token;
    localStorage.setItem('bebiasia-token', token);
    boot();
  }

  async function boot() {
    $('#loginBox').style.display = 'none';
    $('#panel').style.display = 'block';
    const map = await fetch('/api/config').then(r => r.json());
    $('#storeName').textContent = '· ' + map.name;
    loadOrders();
    registerLive();
  }

  async function loadOrders() {
    try {
      const res = await fetch('/api/orders', { headers: { 'x-token': token } });
      if (res.status === 401) return logout();
      orders = await res.json();
      render();
    } catch (e) { /* offline */ }
  }

  function registerLive() {
    if (ev) ev.close();
    ev = new EventSource('/api/events?token=' + encodeURIComponent(token));
    ev.addEventListener('orders', (e) => {
      const o = JSON.parse(e.data);
      const idx = orders.findIndex(x => x.id === o.id);
      if (idx >= 0) orders[idx] = o;
      else orders.unshift(o);
      render();
    });
    ev.onerror = () => { /* EventSource reconecta sozinho */ };
  }

  function logout() {
    token = '';
    localStorage.removeItem('bebiasia-token');
    if (ev) ev.close();
    orders = [];
    $('#panel').style.display = 'none';
    $('#loginBox').style.display = 'block';
  }

  // ---------- Render ----------
  function filtered() {
    if (filter === 'novos') return orders.filter(o => o.status === 'novo');
    if (filter === 'ativos') return orders.filter(o => ['preparando', 'pronto', 'rota'].includes(o.status));
    if (filter === 'finalizados') return orders.filter(o => ['entregue', 'retirado', 'cancelado'].includes(o.status));
    return orders;
  }

  function renderStats() {
    const today = new Date().toDateString();
    $('#sNovos').textContent = orders.filter(o => o.status === 'novo').length;
    $('#sAtivos').textContent = orders.filter(o => ['preparando', 'pronto', 'rota'].includes(o.status)).length;
    $('#sHoje').textContent = orders.filter(o => new Date(o.createdAt).toDateString() === today).length;
    $('#sTotal').textContent = money(orders.filter(o => o.status === 'entregue' || o.status === 'retirado').reduce((a, o) => a + o.totals.grand, 0));
  }

  function render() {
    renderStats();
    const box = $('#orders');
    box.innerHTML = '';
    const list = filtered();
    if (!list.length) {
      box.innerHTML = '<div class="empty">Nenhum pedido aqui por enquanto.</div>';
      return;
    }
    list.forEach(o => box.appendChild(orderCard(o)));
  }

  function orderCard(o) {
    const div = document.createElement('div');
    div.className = 'order status-' + o.status + (o.status === 'novo' ? ' new-order' : '');
    const tipo = o.customer.type === 'entrega' ? 'Entrega' : 'Retirada';
    div.innerHTML = `
      <div class="o-head">
        <span class="number">${o.code}</span>
        <span class="pill">${o.statusLabel}</span>
        <span class="pill muted">${tipo}</span>
        <span class="time">${fmtTime(o.createdAt)} · ${o.eta === '-' ? '—' : o.eta}</span>
      </div>
      <div class="o-body">
        <div class="o-items">
          ${o.items.map(i => `<div class="li"><span>${i.qty}× ${i.name} <small class="muted">(${i.size})</small></span><span>${money(i.price * i.qty)}</span></div>`).join('')}
        </div>
        <div><b>Cliente:</b> ${o.customer.name} <span class="muted">(${o.customer.phone || ''})</span></div>
        ${o.customer.type === 'entrega' ? `<div><b>Endereço:</b> ${o.customer.address}</div>` : ''}
        ${o.customer.note ? `<div><b>Obs:</b> ${o.customer.note}</div>` : ''}
        <div><b>Total:</b> ${money(o.totals.grand)} ${o.totals.delivery ? `<small class="muted">(incl. entrega ${money(o.totals.delivery)})</small>` : ''}</div>
      </div>
      <div class="o-actions no-print">`;

    if (o.status !== 'cancelado' && o.status !== 'entregue' && o.status !== 'retirado') {
      const next = NEXT[o.status];
      if (next) {
        const btn = document.createElement('button');
        btn.className = 'btn primary small';
        btn.textContent = 'Avançar: ' + STATUS_META[next];
        btn.onclick = () => setStatus(o.id, next);
        div.querySelector('.o-actions').appendChild(btn);
      }
      if (o.status === 'rota') {
        const b2 = document.createElement('button');
        b2.className = 'btn small';
        b2.textContent = 'Entregado';
        b2.onclick = () => setStatus(o.id, 'entregue');
        div.querySelector('.o-actions').appendChild(b2);
      }
      if (o.status === 'pronto' && o.customer.type === 'retirada') {
        const b3 = document.createElement('button');
        b3.className = 'btn small';
        b3.textContent = 'Cliente retirou';
        b3.onclick = () => setStatus(o.id, 'retirado');
        div.querySelector('.o-actions').appendChild(b3);
      }
      if (o.status !== 'cancelado') {
        const b4 = document.createElement('button');
        b4.className = 'btn small outline-danger';
        b4.textContent = 'Cancelar';
        b4.onclick = () => setStatus(o.id, 'cancelado');
        div.querySelector('.o-actions').appendChild(b4);
      }
    }

    const imp = document.createElement('button');
    imp.className = 'btn small';
    imp.textContent = 'Imprimir (80mm)';
    imp.onclick = () => printReceipt(o);
    div.querySelector('.o-actions').appendChild(imp);

    const track = document.createElement('button');
    track.className = 'btn small';
    track.textContent = 'Link rastreio';
    track.onclick = () => {
      const url = `${location.origin}/track.html?id=${o.id}`;
      navigator.clipboard && navigator.clipboard.writeText(url).catch(() => {});
      push('Link copiado: ' + url);
    };
    div.querySelector('.o-actions').appendChild(track);

    return div;
  }

  async function setStatus(id, status) {
    const res = await fetch(`/api/orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-token': token },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) return push(data.error || 'Erro');
    const idx = orders.findIndex(x => x.id === id);
    if (idx >= 0) orders[idx] = data.order;
    render();
  }

  // ---------- Impressão térmica 80mm ----------
  function printReceipt(o) {
    const s = (v) => v || '';
    const isEnt = o.customer.type === 'entrega';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pedido ${o.code}</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      body { width: 72mm; margin: 0 auto; font-family: 'Courier New', monospace; font-size: 12px; color: #000; }
      .c { text-align: center; }
      .b { font-weight: bold; }
      .ln { border-top: 1px dashed #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; }
      .dot { border-top: 1px dotted #000; margin: 2px 0; }
      pre { font-family: inherit; margin: 0; font-size: 11px; line-height: 1.35; }
    </style></head><body>
      <div class="c b" style="font-size:16px">${s(o.name) || 'Bebidas'}</div>
      <div class="c" style="font-size:11px">${s(o.address)}</div>
      <div class=c style="font-size:11px">Tel ${s(o.phone)}</div>
      <div class="ln"></div>
      <div class="c b">PEDIDO ${o.code}</div>
      <div class=c>${new Date(o.createdAt).toLocaleString('pt-BR')}</div>
      <div class="c">${o.statusLabel}</div>
      <div class="ln"></div>
      ${o.items.map(i => `<div class="row">${i.qty}x ${i.name} ${i.size}<span>${money(i.price * i.qty)}</span></div><div class="dot"></div>`).join('')}
      <div class="row">Subtotal<span>${money(o.totals.total)}</span></div>
      ${isEnt ? `<div class="row">Entrega<span>${money(o.totals.delivery)}</span></div>` : ''}
      <div class="ln"></div>
      <div class="row b">TOTAL<span>${money(o.totals.grand)}</span></div>
      <div class="ln"></div>
      <div><b>Cliente:</b> ${s(o.customer.name)}</div>
      ${o.customer.phone ? `<div><b>Tel:</b> ${s(o.customer.phone)}</div>` : ''}
      <div><b>Tipo:</b> ${isEnt ? 'Entrega' : 'Retirada'}</div>
      ${isEnt && o.customer.address ? `<pre><b>End:</b> ${s(o.customer.address)}</pre>` : ''}
      ${o.customer.note ? `<pre><b>Obs:</b> ${s(o.customer.note)}</pre>` : ''}
      <div class="ln"></div>
      <div class="c b">OBRIGADO, VOLTE SEMPRE!</div>
      <div class="c" style="font-size:11px">Tempo real: ${location.origin}/track.html?id=${o.id}</div>
      <script>window.print();<\/script>
    </body></html>`;
    const w = window.open('', '_blank', 'width=380,height=700');
    if (!w) return push('Permita pop-ups para imprimir.');
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // ---------- Events ----------
  $('#doLogin').onclick = login;
  $('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  $('#logout').onclick = logout;
  document.querySelectorAll('.filter-row .tab').forEach(t => {
    t.onclick = () => {
      filter = t.dataset.f;
      document.querySelectorAll('.filter-row .tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      render();
    };
  });

  if (token) {
    fetch('/api/orders', { headers: { 'x-token': token } })
      .then(r => r.ok ? boot() : logout())
      .catch(() => logout());
  }
})();