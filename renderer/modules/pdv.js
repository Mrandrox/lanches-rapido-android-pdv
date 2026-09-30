'use strict';

/* ============================================================
   PDV — cardápio, carrinho, venda no balcão e delivery
   ============================================================ */
(function () {
  const App = window.App;
  const st = {
    cat: null,
    cart: [],
    type: 'counter',
    payment: 'Pix',
    customerId: null,
    customerName: '',
    phone: '',
    address: '',
    discount: 0,
    note: '',
    fee: null,
  };

  function money(v) { return App.money(v); }

  function orderFee() {
    if (st.type !== 'delivery') return 0;
    return st.fee != null ? st.fee : (App.data.settings.deliveryFee || 0);
  }
  function subtotal() {
    return st.cart.reduce((s, i) => s + i.price * i.qty, 0);
  }
  function discount() {
    const sub = subtotal();
    const d = parseFloat(st.discount) || 0;
    return Math.min(Math.max(d, 0), sub);
  }
  function total() {
    return subtotal() - discount() + orderFee();
  }

  function show() {
    if (!st.cat) st.cat = (App.data.categories[0] || { id: null }).id;
    render();
  }

  function render() {
    const root = document.getElementById('screenContent');
    root.innerHTML = `
      <div class="pdv">
        <div class="pdv-catalog">
          <div class="cat-tabs" id="catTabs"></div>
          <div class="prod-grid" id="prodGrid"></div>
        </div>
        <div class="cart">
          <div class="cart-head">🛒 Carrinho</div>
          <div class="cart-items" id="cartItems"></div>
          <div class="cart-form" id="cartForm"></div>
        </div>
      </div>`;
    renderCats();
    renderProds();
    renderCart();
  }

  function renderCats() {
    const tabs = document.getElementById('catTabs');
    tabs.innerHTML = '';
    App.data.categories.forEach(c => {
      const b = document.createElement('button');
      b.className = 'cat-tab' + (c.id === st.cat ? ' active' : '');
      b.textContent = c.icon + ' ' + c.name;
      b.onclick = () => { st.cat = c.id; renderCats(); renderProds(); };
      tabs.appendChild(b);
    });
  }

  function renderProds() {
    const grid = document.getElementById('prodGrid');
    grid.innerHTML = '';
    const prods = App.data.products.filter(p => p.categoryId === st.cat);
    if (!prods.length) {
      grid.innerHTML = '<div class="empty-state">Nenhum produto nesta categoria.</div>';
      return;
    }
    prods.forEach(p => {
      const b = document.createElement('button');
      b.className = 'prod' + (p.active === false ? ' inactive' : '');
      b.innerHTML = `
        ${p.image ? `<img class="ico" src="${p.image}" style="width:40px;height:40px;object-fit:cover;border-radius:8px">` : `<span class="ico">🍔</span>`}
        <span class="nm">${App.esc(p.name)}${p.active === false ? ' (inativo)' : ''}</span>
        <span class="pr">${money(p.price)}</span>`;
      b.onclick = () => addProduct(p);
      b.title = p.description || p.name;
      grid.appendChild(b);
    });
  }

  function addProduct(p) {
    const it = st.cart.find(i => i.id === p.id);
    if (it) it.qty++;
    else st.cart.push({ id: p.id, name: p.name, price: p.price, qty: 1 });
    renderCart();
  }

  function setQty(id, delta) {
    const it = st.cart.find(i => i.id === id);
    if (!it) return;
    it.qty += delta;
    if (it.qty <= 0) st.cart = st.cart.filter(i => i.id !== id);
    renderCart();
  }

  function renderCart() {
    const items = document.getElementById('cartItems');
    const form = document.getElementById('cartForm');
    if (st.cart.length) {
      items.innerHTML = st.cart.map(i => `
        <div class="cart-item">
          <span class="nm">${App.esc(i.name)}<small>${money(i.price)}</small></span>
          <span class="qty-ctl">
            <button onclick="window.__pdv.qty('${i.id}',-1)">−</button>
            <span>${i.qty}</span>
            <button onclick="window.__pdv.qty('${i.id}',1)">+</button>
          </span>
          <span class="sub">${money(i.price * i.qty)}</span>
        </div>`).join('');
    } else {
      items.innerHTML = '<div class="empty-state"><span class="emoji-big">🛒</span>Toque nos produtos<br>para montar o pedido</div>';
    }

    const custLabel = st.customerName || (st.customerId ? '(selecionado)' : '');
    const payLabels = { Pix: 'Pix', Dinheiro: 'Din.', Cartão: 'Cartão', Crédito: 'Créd.', Débito: 'Déb.', Pendente: 'Pend.' };
    form.innerHTML = `
      <div class="type-seg">
        <button class="${st.type === 'counter' ? 'active' : ''}" onclick="window.__pdv.type('counter')">🏪 Balcão</button>
        <button class="${st.type === 'delivery' ? 'active' : ''}" onclick="window.__pdv.type('delivery')">🛵 Delivery</button>
      </div>

      <button class="btn btn-ghost btn-block" onclick="window.__pdv.pick()">
        ${custLabel ? '👤 ' + App.esc(custLabel) : '👤 Escolher cliente / continuar anônimo'}
      </button>

      ${st.type === 'delivery' ? `
        <div class="field"><label>Endereço de entrega</label><input id="addr" value="${App.esc(st.address)}" placeholder="Rua, número, bairro"></div>
        <div class="row"> <div class="field" style="flex:1"><label>Taxa de entrega</label><input id="fee" type="number" step="0.5" value="${orderFee()}"></div></div>
      ` : ''}
      <div class="field"><label>Desconto (R$)</label><input id="disc" type="number" step="0.01" min="0" value="${st.discount || ''}" placeholder="0,00"></div>
      <div class="field"><label>Observações</label><input id="note" value="${App.esc(st.note)}" placeholder="Sem cebola, chega bonito…"></div>

      <div class="pay-seg">
        ${Object.entries(payLabels).map(([k, l]) =>
          `<button class="${st.payment === k ? 'active' : ''}" onclick="window.__pdv.pay('${k}')">${l}</button>`).join('')}
      </div>

      <div>
        <div class="tot-line"><span>Subtotal</span><span>${money(subtotal())}</span></div>
        ${discount() > 0 ? `<div class="tot-line"><span>Desconto</span><span>-${money(discount())}</span></div>` : ''}
        ${st.type === 'delivery' ? `<div class="tot-line"><span>Entrega</span><span>${money(orderFee())}</span></div>` : ''}
        <div class="tot-line grand"><span>Total</span><span>${money(total())}</span></div>
      </div>
      <button class="btn btn-primary btn-block" ${st.cart.length ? '' : 'disabled'} onclick="window.__pdv.finish()">
        Finalizar · ${money(total())}
      </button>`;

    const d = document.getElementById('disc'), n = document.getElementById('note');
    if (d) d.oninput = (e) => { st.discount = e.target.value; renderCart(); };
    if (n) n.oninput = (e) => { st.note = e.target.value; };
    const a = document.getElementById('addr');
    if (a) a.oninput = (e) => { st.address = e.target.value; };
    const f = document.getElementById('fee');
    if (f) f.onchange = () => { st.fee = parseFloat(f.value) || 0; renderCart(); };
  }

  window.__pdv = {
    qty: setQty,
    type(t) { st.type = t; if (t === 'counter') st.fee = null; renderCart(); },
    pay(p) { st.payment = p; renderCart(); },
    pick() { pickCustomer(); },
    finish() { finishSale(); },
    onPrint(order) {
      const kind = order.type === 'delivery' ? 'cozinha' : 'venda';
      setTimeout(() => App.printOrder(order, kind), 120);
    },
  };

  function pickCustomer() {
    const d = App.data.customers;
    const close = App.modal(`
      <h3>👤 Cliente</h3>
      <input id="cSearch" placeholder="Buscar por nome ou telefone…" style="margin-bottom:10px">
      <div id="cList" style="max-height:220px;overflow:auto"></div>
      <div class="field" style="margin-top:12px"><label>Novo cliente (nome)</label><input id="cName"></div>
      <div class="field"><label>Telefone</label><input id="cPhone" placeholder="(11) 99999-9999"></div>
      <div class="field"><label>Endereço</label><input id="cAddr" placeholder="Rua, número, bairro"></div>
      <div class="modal-actions">
        <button class="btn" onclick="window.__pdv.semi()">Sem cadastro</button>
        <button class="btn btn-primary" onclick="window.__pdv.saveC()">Usar este cliente</button>
      </div>`,
      { onMount: (box, cl) => {
        window.__pdv.saveC = async () => {
          const name = box.querySelector('#cName').value.trim();
          const phone = box.querySelector('#cPhone').value.trim();
          const addr = box.querySelector('#cAddr').value.trim();
          st.customerId = null;
          st.customerName = name || 'Cliente';
          st.phone = phone;
          st.address = addr;
          if (name) {
            const existing = d.find(c => c.phone && c.phone === phone.replace(/\D/g, ''));
            if (!existing) {
              try {
                await App.api('/api/customers', { method: 'POST', body: { name, phone, address: addr } });
                await App.refresh();
              } catch (e) { App.toast(e.message, true); }
            } else {
              st.customerId = existing.id;
            }
          }
          cl(); renderCart();
        };
        window.__pdv.semi = () => { st.customerId = null; st.customerName = ''; st.phone = ''; cl(); renderCart(); };
        const renderList = (q) => {
          const list = box.querySelector('#cList');
          const rows = d.filter(c => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q));
          list.innerHTML = rows.length ? rows.map(c => `
            <button style="display:block;width:100%;text-align:left;padding:9px;border-radius:9px;border:1px solid var(--line);background:var(--card2);margin-bottom:6px;cursor:pointer;color:var(--text)"
              onclick="window.__pdv.useC('${c.id}')">
              <b>${App.esc(c.name || 'Sem nome')}</b>
              <span class="muted"> ${c.phone ? App.esc(c.phone) : ''} · ${App.esc(c.address || 'sem endereço')}</span>
            </button>`).join('') : '<div class="muted">Nenhum cliente.</div>';
        };
        window.__pdv.useC = (id) => {
          const c = d.find(x => x.id === id);
          if (!c) return;
          st.customerId = c.id; st.customerName = c.name; st.phone = c.phone; st.address = c.address;
          cl(); renderCart();
        };
        box.querySelector('#cSearch').oninput = (e) => renderList(e.target.value.toLowerCase());
        renderList('');
      } });
  }

  async function finishSale() {
    if (!st.cart.length) return;
    const delivery = st.type === 'delivery';
    let customerId = st.customerId;
    if (!customerId && st.customerName) {
      const find = App.data.customers.find(c => c.phone && c.phone === st.phone.replace(/\D/g, ''));
      if (find) customerId = find.id;
    }
    const payload = {
      type: st.type,
      items: st.cart.map(i => ({ id: i.id, qty: i.qty })),
      payment: st.payment,
      discount: st.discount || 0,
      note: st.note,
      customerId,
      phone: st.phone,
      address: delivery ? st.address : '',
      deliveryFee: delivery ? orderFee() : undefined,
      print: true,
    };
    if (delivery && !st.address.trim()) {
      App.toast('Informe o endereço de entrega.', true);
      return;
    }
    try {
      const order = await App.api('/api/orders', { method: 'POST', body: payload });
      st.cart = []; st.customerId = null; st.customerName = ''; st.phone = ''; st.address = ''; st.discount = 0; st.note = ''; st.fee = null;
      renderCart(); renderProds();
      App.toast(delivery ? `Pedido #${order.number} registrado 🚚` : `Venda #${order.number} registrada ✅`);
      if (delivery) {
        App.modal(followUpModal(order));
      }
      await App.refresh();
    } catch (e) {
      App.toast(e.message, true);
    }
  }

  function followUpModal(order) {
    const link = `${App.base}/track/${order.id}`;
    const couriers = App.data.users.filter(u => u.role === 'courier' && u.active !== false);
    return `
      <h3>🚚 Pedido #${order.number}</h3>
      <p class="muted" style="margin-bottom:12px">Link de rastreio do cliente (enviar por WhatsApp):</p>
      <div class="row">
        <input readonly value="${link}" id="trackLink">
        <button class="btn btn-primary" onclick="navigator.clipboard.writeText('${link}');App.toast('Link copiado! 📋')">Copiar</button>
      </div>
      ${couriers.length ? `
        <div class="field" style="margin-top:14px"><label>Atribuir entregador</label>
          <select id="assignSel">${couriers.map(c => `<option value="${c.id}">${App.esc(c.name)}</option>`).join('')}</select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" onclick="window.__pdv.assign('${order.id}')">Atribuir agora</button>
        </div>` : `
        <p class="muted mt">Nenhum entregador cadastrado. Cadastre em Configurações → Contas.</p>`}`;
  }

  window.__pdv.assign = async (oid) => {
    const sel = document.getElementById('assignSel');
    if (!sel) return;
    try {
      await App.api(`/api/orders/${oid}/assign`, { method: 'POST', body: { courierId: sel.value } });
      App.closeModal();
      App.toast('Entregador atribuído! 🛵');
      await App.refresh();
    } catch (e) { App.toast(e.message, true); }
  };

  App.registerScreen({
    id: 'pdv',
    label: 'PDV',
    icon: '🏪',
    roles: ['admin', 'operator'],
    show,
    onPrint: window.__pdv.onPrint,
  });
})();