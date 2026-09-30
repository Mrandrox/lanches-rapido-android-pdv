'use strict';

/* ============================================================
   Clientes — cadastro, busca e histórico de pedidos por cliente
   ============================================================ */
(function () {
  const App = window.App;
  const st = { search: '' };

  function show() { render(); }

  function render() {
    const root = document.getElementById('screenContent');
    const list = App.data.customers.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const q = st.search.toLowerCase();

    root.innerHTML = `
      <div class="row-between wrap mb">
        <h3 class="section-title" style="margin:0">Clientes (${list.length})</h3>
        <div class="row">
          <input value="${App.esc(st.search)}" placeholder="🔎 Buscar…" style="width:200px" oninput="window.__cu.search(this.value)">
          <button class="btn btn-primary" onclick="window.__cu.new()">＋ Cliente</button>
        </div>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <table class="table">
          <thead><tr><th>Nome</th><th>Telefone</th><th>Endereço</th><th>Pedidos</th><th class="actions">Ações</th></tr></thead>
          <tbody>
            ${list.filter(c => !q || (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)).map(c => {
              const orders = App.data.orders.filter(o => o.customerId === c.id).length;
              const spent = App.data.orders.filter(o => o.customerId === c.id).reduce((s, o) => s + o.total, 0);
              return `
                <tr>
                  <td><b>${App.esc(c.name || '—')}</b></td>
                  <td>${App.esc(c.phone || '—')}</td>
                  <td class="muted">${App.esc(c.address || '—')}</td>
                  <td>${orders} pedidos <span class="muted">(${App.money(spent)})</span></td>
                  <td class="actions">
                    <button class="icon-btn" title="Pedidos" onclick="window.__cu.orders('${c.id}')">📦</button>
                    <button class="icon-btn" title="Editar" onclick="window.__cu.edit('${c.id}')">✏️</button>
                  </td>
                </tr>`;
            }).join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:26px">Nenhum cliente cadastrado.</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  function form(c) {
    c = c || {};
    return `
      <h3>${c.id ? 'Editar cliente' : 'Novo cliente'}</h3>
      <div class="field"><label>Nome</label><input id="cuName" value="${App.esc(c.name || '')}"></div>
      <div class="field"><label>Telefone (WhatsApp)</label><input id="cuPhone" value="${App.esc(c.phone || '')}" placeholder="(11) 99999-9999"></div>
      <div class="field"><label>Endereço</label><input id="cuAddr" value="${App.esc(c.address || '')}"></div>
      <div class="field"><label>Observações</label><input id="cuNote" value="${App.esc(c.note || '')}" placeholder="Preferências, restrições…"></div>
      <div class="modal-actions">
        <button class="btn" data-x>Cancelar</button>
        <button class="btn btn-primary" onclick="window.__cu.save('${c.id || ''}')">Salvar</button>
      </div>`;
  }

  window.__cu = {
    search(v) { st.search = v; render(); },
    new() { App.modal(form()); },
    edit(id) { App.modal(form(App.data.customers.find(c => c.id === id))); },
    async save(id) {
      const b = {
        name: document.getElementById('cuName').value.trim(),
        phone: document.getElementById('cuPhone').value.trim(),
        address: document.getElementById('cuAddr').value.trim(),
        note: document.getElementById('cuNote').value.trim(),
      };
      if (!b.name && !b.phone) return App.toast('Informe nome ou telefone.', true);
      try {
        if (id) await App.api('/api/customers/' + id, { method: 'PUT', body: b });
        else await App.api('/api/customers', { method: 'POST', body: b });
        await App.refresh();
        App.closeModal(); render(); App.toast('Cliente salvo ✅');
      } catch (e) { App.toast(e.message, true); }
    },
    orders(id) {
      const c = App.data.customers.find(x => x.id === id);
      const orders = App.data.orders.filter(o => o.customerId === id);
      App.modal(`
        <h3>📦 Pedidos de ${App.esc(c ? c.name : '')}</h3>
        ${orders.length ? orders.slice(0, 20).map(o => `
          <div class="row-between" style="padding:7px 0;border-bottom:1px solid var(--line);font-size:13px">
            <span><b>#${o.number}</b> ${App.badgeForOrder(o)} <span class="muted">${App.dt(o.createdAt)}</span></span>
            <b>${App.money(o.total)}</b>
          </div>`).join('')
        : '<div class="empty-state">Nenhum pedido ainda.</div>'}
        <div class="modal-actions"><button class="btn btn-primary" data-x>Fechar</button></div>`);
    },
  };

  App.registerScreen({ id: 'customers', label: 'Clientes', icon: '👥', roles: ['admin', 'operator'], show });
})();