'use strict';

/* ============================================================
   Relatórios — resumo do dia, formas de pagamento e destaque de vendas
   ============================================================ */
(function () {
  const App = window.App;
  const money = v => App.money(v);
  const st = { day: 0 };

  function startOf(d) {
    const x = new Date();
    x.setDate(x.getDate() - d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function show() { render(); }

  function render() {
    const root = document.getElementById('screenContent');
    const from = startOf(st.day);
    const orders = App.data.orders.filter(o => new Date(o.createdAt) >= from && o.status !== 'canceled');
    const revenue = orders.reduce((s, o) => s + o.total, 0);
    const byPayment = {};
    orders.forEach(o => { byPayment[o.payment] = (byPayment[o.payment] || 0) + o.total; });

    const productCount = {};
    orders.forEach(o => o.items.forEach(i => { productCount[i.name] = (productCount[i.name] || 0) + i.qty; }));
    const best = Object.entries(productCount).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const deliveries = orders.filter(o => o.type === 'delivery');

    const dayLabels = { 0: 'Hoje', 1: 'Ontem', 6: 'Últimos 7 dias', 29: 'Últimos 30 dias' };
    const label = st.day === 0 ? 'Hoje' : st.day === 1 ? 'Ontem' : `Últimos ${st.day} dias`;

    root.innerHTML = `
      <div class="row-between wrap mb">
        <h3 class="section-title" style="margin:0">Relatórios</h3>
        <div class="row">
          <select style="width:auto" onchange="window.__rep.day(this.value)">
            ${Object.keys(dayLabels).map(d => `<option value="${d}" ${d == st.day ? 'selected' : ''}>${dayLabels[d]}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="grid mb" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
        <div class="card"><div class="section-title">Faturamento</div><b style="font-size:20px">${money(revenue)}</b></div>
        <div class="card"><div class="section-title">Pedidos</div><b style="font-size:20px">${orders.length}</b><div class="muted">${orders.length ? 'Média ' + money(revenue / orders.length) : ''}</div></div>
        <div class="card"><div class="section-title">Delivery</div><b style="font-size:20px">${deliveries.length}</b></div>
        <div class="card"><div class="section-title">Itens vendidos</div><b style="font-size:20px">${Object.values(productCount).reduce((s, v) => s + v, 0)}</b></div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <h3 class="section-title">Formas de pagamento</h3>
          ${Object.entries(byPayment).map(([k, v]) => `
            <div class="tot-line"><span>${App.esc(k)}</span><b>${money(v)}</b></div>`).join('') || '<div class="muted">Sem vendas no período.</div>'}
        </div>
        <div class="card">
          <h3 class="section-title">Produtos mais vendidos</h3>
          ${best.length ? best.map(([n, v], i) => `
            <div class="tot-line"><span>${i + 1}. ${App.esc(n)}</span><b>${v} un</b></div>`).join('') : '<div class="muted">Sem vendas no período.</div>'}
        </div>
      </div>`;
  }

  window.__rep = {
    day(d) { st.day = parseInt(d, 10); render(); },
  };

  App.registerScreen({ id: 'reports', label: 'Relatórios', icon: '📊', roles: ['admin', 'operator'], show });
})();