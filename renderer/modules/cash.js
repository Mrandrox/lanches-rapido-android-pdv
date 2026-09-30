'use strict';

/* ============================================================
   Fluxo de Caixa — abertura, sangria, suprimento e fechamento
   ============================================================ */
(function () {
  const App = window.App;
  const money = v => App.money(v);

  function show() { render(); }

  function render() {
    const root = document.getElementById('screenContent');
    const c = App.data.cash || {};

    if (!c.open) {
      root.innerHTML = `
        <div class="empty-state" style="padding:40px 20px">
          <span class="emoji-big">💰</span>
          <h3 style="color:var(--text)">Caixa fechado</h3>
          <p class="muted">Abra o caixa para registrar vendas do dia.</p>
        </div>
        <div class="card" style="max-width:380px;margin:0 auto">
          <div class="field"><label>Valor da abertura (R$)</label><input id="openVal" type="number" step="0.01" min="0" value="0"></div>
          <button class="btn btn-primary btn-block" onclick="window.__cash.open()">Abrir caixa</button>
        </div>`;
      return;
    }

    const entries = c.entries || [];
    const sales = App.data.orders.filter(o => o.status === 'finished' || o.status === 'delivered');
    const byPayment = {};
    sales.forEach(o => { byPayment[o.payment] = (byPayment[o.payment] || 0) + o.total; });
    const counts = sales.length;

    root.innerHTML = `
      <h3 class="section-title">Resumo do caixa — aberto ${App.dt(c.openedAt)} por ${App.esc(c.operator || '')}</h3>
      <div class="grid grid-2 mb">
        <div class="card">
          <div class="tot-line"><span>Vendas registradas</span><b>${counts}</b></div>
          <div class="tot-line"><span>Suprimento inicial</span><b>${money(c.opening)}</b></div>
          <div class="tot-line">${c.entries.filter(e => e.kind === 'deposit').length ? '<span>Suprimentos</span><b>' + money(c.entries.filter(e => e.kind === 'deposit').reduce((s, e) => s + e.value, 0)) + '</b>' : ''}</div>
          <div class="tot-line">${c.entries.filter(e => e.kind === 'withdraw').length ? '<span>Sangrias</span><b style="color:var(--danger)">- ' + money(c.entries.filter(e => e.kind === 'withdraw').reduce((s, e) => s + e.value, 0)) + '</b>' : ''}</div>
          <div class="tot-line grand"><span>Saldo esperado</span><b>${money(c.balance)}</b></div>
        </div>
        <div class="card">
          <h3 class="section-title">Vendas por forma de pagamento</h3>
          ${Object.entries(byPayment).map(([k, v]) => `<div class="tot-line"><span>${App.esc(k)}</span><b>${money(v)}</b></div>`).join('') || '<div class="muted">Sem vendas ainda.</div>'}
        </div>
      </div>

      <div class="card mb">
        <h3 class="section-title">Movimentações</h3>
        <table class="table">
          <thead><tr><th>#</th><th>Tipo</th><th>Descrição</th><th>Hora</th><th>Valor</th></tr></thead>
          <tbody>
            ${entries.slice().reverse().map((e, i) => `
              <tr>
                <td>${entries.length - i}</td>
                <td>${e.kind === 'withdraw' ? '<span style="color:var(--danger)">Sangria</span>' : '<span style="color:var(--accent-2)">Suprimento</span>'}</td>
                <td>${App.esc(e.desc || '—')}</td>
                <td class="muted">${App.dt(e.at)}</td>
                <td><b>${e.kind === 'withdraw' ? '-' : '+'}${money(e.value)}</b></td>
              </tr>`).join('') || '<tr><td colspan="5" class="muted" style="text-align:center">Nenhuma movimentação além das vendas.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="row">
        <button class="btn" onclick="window.__cash.entry('withdraw')">💸 Sangria</button>
        <button class="btn" onclick="window.__cash.entry('deposit')">🏦 Suprimento</button>
        <button class="btn btn-primary" onclick="window.__cash.close()">🔒 Fechar caixa</button>
        <button class="btn btn-ghost" onclick="window.__cash.print()">🖨️ Imprimir relatório</button>
      </div>`;
  }

  window.__cash = {
    async open() {
      const v = parseFloat(document.getElementById('openVal').value) || 0;
      try {
        await App.api('/api/cash/open', { method: 'POST', body: { opening: v } });
        await App.refresh(); render();
        App.toast('Caixa aberto 💰');
      } catch (e) { App.toast(e.message, true); }
    },
    entry(kind) {
      App.modal(`
        <h3>${kind === 'withdraw' ? '💸 Sangria' : '🏦 Suprimento'}</h3>
        <div class="field"><label>Valor (R$) *</label><input id="ev" type="number" step="0.01" min="0"></div>
        <div class="field"><label>Descrição</label><input id="ed" placeholder="Motivo…"></div>
        <div class="modal-actions">
          <button class="btn" data-x>Cancelar</button>
          <button class="btn btn-primary" onclick="window.__cash.entrySave('${kind}')">Confirmar</button>
        </div>`);
    },
    async entrySave(kind) {
      const value = parseFloat(document.getElementById('ev').value) || 0;
      if (value <= 0) return App.toast('Informe o valor.', true);
      const desc = document.getElementById('ed').value.trim();
      try {
        await App.api('/api/cash/' + kind, { method: 'POST', body: { value, desc } });
        await App.refresh(); render();
        App.closeModal();
        App.toast(kind === 'withdraw' ? 'Sangria registrada 💸' : 'Suprimento registrado 🏦');
      } catch (e) { App.toast(e.message, true); }
    },
    close() {
      const c = App.data.cash || {};
      App.modal(`
        <h3>🔒 Fechar caixa</h3>
        <p class="muted mb">Saldo esperado: <b style="color:var(--text)">${money(c.balance)}</b></p>
        <div class="field"><label>Valor em dinheiro no caixa (R$)</label><input id="cv" type="number" step="0.01" min="0" value="${c.balance || ''}"></div>
        <div class="modal-actions">
          <button class="btn" data-x>Cancelar</button>
          <button class="btn btn-primary" onclick="window.__cash.closeSave()">Fechar</button>
        </div>`);
    },
    async closeSave() {
      const counted = parseFloat(document.getElementById('cv').value) || 0;
      try {
        const d = await App.api('/api/cash/close', { method: 'POST', body: { counted } });
        await App.refresh(); render(); App.closeModal();
        const diff = d.difference;
        if (diff === 0) App.toast('Caixa fechado sem diferença ✅');
        else App.toast(diff > 0 ? `Caixa fechado — sobra de ${money(diff)}` : `Caixa fechado — falta de ${money(Math.abs(diff))}`, diff < 0);
      } catch (e) { App.toast(e.message, true); }
    },
    async print() {
      const c = App.data.cash || {};
      const sales = App.data.orders.filter(o => o.status === 'finished' || o.status === 'delivered');
      const s = App.data.settings;
      const now = new Date();
      const daysSales = sales.filter(o => new Date(o.updatedAt).toDateString() === now.toDateString());
      const byPayment = {};
      sales.forEach(o => { byPayment[o.payment] = (byPayment[o.payment] || 0) + o.total; });
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:"Courier New",monospace;width:300px;color:#000;background:#fff;font-size:12px;padding:8px}
        .c{text-align:center}.thick{border-top:1px dashed #000;margin:4px 0}
        table{width:100%;border-collapse:collapse}td{padding:2px 0}
        </style></head><body>
        <div class="c" style="font-size:15px;font-weight:800">${App.esc(s.name)}</div>
        <div class="c">RELATÓRIO DE FECHAMENTO</div>
        <div class="c" style="font-size:11px">${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="thick"></div>
        <table>
          <tr><td>Abertura</td><td style="text-align:right">${money(c.opening)}</td></tr>
          <tr><td>Vendas (${sales.length})</td><td style="text-align:right">${money(c.sales || 0)}</td></tr>
          ${c.entries.filter(e => e.kind === 'deposit').length ? `<tr><td>Suprimentos</td><td style="text-align:right">${money(c.entries.filter(e => e.kind === 'deposit').reduce((s2, e) => s2 + e.value, 0))}</td></tr>` : ''}
          ${c.entries.filter(e => e.kind === 'withdraw').length ? `<tr><td>Sangrias</td><td style="text-align:right">-${money(c.entries.filter(e => e.kind === 'withdraw').reduce((s2, e) => s2 + e.value, 0))}</td></tr>` : ''}
          <tr><td style="font-weight:800">TOTAL</td><td style="text-align:right;font-weight:800">${money((c.sales || 0) + c.opening)}</td></tr>
        </table>
        <table style="margin-top:8px">${Object.entries(byPayment).map(([k, v]) => `<tr><td>${App.esc(k)}</td><td style="text-align:right">${money(v)}</td></tr>`).join('')}</table>
        <div class="thick"></div>
        <div class="c" style="font-size:11px">Valor contado: ${money(c.closing || 0)}</div>
        <div class="c" style="font-size:11px">Diferença: ${money((c.closing || 0) - (c.sales || 0) - c.opening)}</div>
        <div class="c" style="margin-top:8px;font-size:10px">Assinatura do operador: ____________</div>
        <div style="height:40px"></div>
        </body></html>`;
      try {
        const r = await window.lv.printHtml({ html, copies: (s.printer && s.printer.copies) || 1, deviceName: (s.printer && s.printer.name) || '', silent: true });
        if (!r.ok) App.toast('Erro ao imprimir: ' + r.error, true);
      } catch (e) { App.toast('Erro ao imprimir: ' + e.message, true); }
    },
  };

  App.registerScreen({ id: 'cash', label: 'Caixa', icon: '💰', roles: ['admin', 'operator'], show });
})();