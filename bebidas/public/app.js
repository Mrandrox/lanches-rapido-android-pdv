(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const state = {
    menu: [],
    active: null,
    cart: [],
    hasMsg: false,
  };

  const storageKey = 'bebiasia-cart';

  function money(v) { return 'R$ ' + v.toFixed(2).replace('.', ','); }

  function saveCart() { localStorage.setItem(storageKey, JSON.stringify(state.cart)); updateCartUI(); }

  function loadCart() {
    try { state.cart = JSON.parse(localStorage.getItem(storageKey)) || []; }
    catch (e) { state.cart = []; }
    updateCartUI();
  }

  function push(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function cartQty(id) {
    const it = state.cart.find(i => i.id === id);
    return it ? it.qty : 0;
  }

  function addItem(p, qty = 1) {
    const it = state.cart.find(i => i.id === p.id);
    if (it) it.qty += qty;
    else state.cart.push({ id: p.id, name: p.name, size: p.size, price: p.price, qty });
    saveCart();
  }

  function addAISelection(items) {
    items.forEach(({ id, qty }) => {
      const p = state.menu.flat().find(m => m.id === id);
      if (p) addItem(p, qty);
    });
    push('Itens adicionados ao carrinho!');
    openCart();
  }

  // ---------- Config + menu ----------
  async function boot() {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    $('#storeName').textContent = cfg.name;
    $('#storeTag').textContent = cfg.tagline || 'Atendente IA de bebidas';
    $('#logo').textContent = (cfg.name || 'BI').slice(0, 2).toUpperCase();
    $('#heroText').textContent = cfg.tagline || 'Monte seu pedido no cardápio ou converse com o atendente IA.';
    if (cfg.ann) {
      $('#ann').textContent = cfg.ann;
      $('#ann').style.display = 'inline-block';
    }

    const m = await fetch('/api/menu').then(r => r.json());
    state.menu = m;
    renderTabs();
    renderGrid();
  }

  function renderTabs() {
    const tabs = $('#tabs');
    tabs.innerHTML = '';
    state.menu.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'tab' + (i === 0 ? ' active' : '');
      b.textContent = c.name;
      b.onclick = () => {
        tabs.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        renderGrid(c.id);
      };
      tabs.appendChild(b);
    });
  }

  function renderGrid(catId) {
    const grid = $('#grid');
    grid.innerHTML = '';
    const groups = catId ? state.menu.filter(c => c.id === catId) : state.menu;
    groups.forEach(c => {
      const h = document.createElement('h3');
      h.className = 'section-title';
      h.textContent = c.name;
      grid.appendChild(h);
      c.items.forEach(p => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <div>
            <div class="title">${p.name}</div>
            <div class="size">${p.size} · <span class="tag">${p.cat}</span></div>
          </div>
          <div class="row">
            <span class="price">${money(p.price)}</span>
            <button class="btn primary small add-btn" data-id="${p.id}">+ Adicionar</button>
          </div>`;
        card.querySelector('.add-btn').onclick = () => {
          addItem(p);
          push(`${p.name} (${p.size}) adicionado. Total no carrinho: <b>${cartCount()}</b> item(s).`);
        };
        grid.appendChild(card);
      });
    });
  }

  function cartCount() { return state.cart.reduce((a, i) => a + i.qty, 0); }
  function cartTotal() { return state.cart.reduce((a, i) => a + i.price * i.qty, 0); }

  // ---------- Cart UI ----------
  function updateCartUI() {
    $('#cartCount').textContent = cartCount();
    renderCart();
  }

  function renderCart() {
    const body = $('#cartBody');
    const footer = $('#cartFooter');
    body.innerHTML = '';
    if (!state.cart.length) {
      body.innerHTML = '<div class="empty">Seu carrinho está vazio.<br>Escolha no cardápio ou chame a IA.</div>';
      footer.style.display = 'none';
      return;
    }
    state.cart.forEach(it => {
      const row = document.createElement('div');
      row.className = 'cart-item';
      row.innerHTML = `
        <div class="info">
          <b>${it.name}</b>
          <small>${it.size} · ${money(it.price)}</small>
          <div class="qty-row">
            <button data-id="${it.id}" data-op="-">−</button>
            <span style="min-width:26px;text-align:center">${it.qty}</span>
            <button data-id="${it.id}" data-op="+">+</button>
          </div>
        </div>
        <button class="btn small outline-danger" data-id="${it.id}" data-op="del">remover</button>
        <span class="line-price">${money(it.price * it.qty)}</span>`;
      row.querySelector('[data-op="-"]').onclick = () => changeQty(it.id, -1);
      row.querySelector('[data-op="+"]').onclick = () => changeQty(it.id, 1);
      row.querySelector('[data-op="del"]').onclick = () => changeQty(it.id, -9999);
      body.appendChild(row);
    });

    footer.style.display = 'block';
    footer.innerHTML = `
      <div class="field">
        <label>Nome</label>
        <input id="cName" placeholder="Seu nome">
      </div>
      <div class="field">
        <label>WhatsApp / Telefone</label>
        <input id="cPhone" placeholder="(00) 00000-0000">
      </div>
      <div class="field">
        <label>Tipo de pedido</label>
        <select id="cType">
          <option value="retirada">Retirar no balcão</option>
          <option value="entrega">Entrega (taxa R$ 5,00)</option>
        </select>
      </div>
      <div class="field" id="addrField" style="display:none">
        <label>Endereço de entrega</label>
        <input id="cAddr" placeholder="Rua, número, bairro, referência">
      </div>
      <div class="field">
        <label>Observações (opcional)</label>
        <input id="cNote" placeholder="Ex.: sem gelo, geladíssima...">
      </div>
      <div class="totals">
        <div class="t"><span>Subtotal</span><span id="tSub">${money(cartTotal())}</span></div>
        <div class="t" id="tWhere"></div>
        <div class="t grand"><span>Total</span><span id="tGrand">${money(cartTotal())}</span></div>
      </div>
      <button class="btn primary" id="placeOrder" style="width:100%;justify-content:center;padding:13px">
        Fazer pedido
      </button>`;

    const typeSel = $('#cType', footer);
    const addrField = $('#addrField', footer);
    typeSel.onchange = () => updateTotals(typeSel, addrField);
    $('#placeOrder', footer).onclick = submitOrder;

    const plat = document.createElement('button');
    plat.className = 'btn';
    plat.style.cssText = 'width:100%;justify-content:center;margin-top:8px';
    plat.textContent = 'Limpar carrinho';
    plat.onclick = () => { state.cart = []; saveCart(); };
    footer.appendChild(plat);
    updateTotals(typeSel, addrField);
  }

  function updateTotals(typeSel, addrField) {
    const isDelivery = typeSel.value === 'entrega';
    addrField.style.display = isDelivery ? 'block' : 'none';
    const sub = cartTotal();
    const delivery = isDelivery ? 5 : 0;
    $('#tWhere').innerHTML = `<span>Entrega</span><span>${money(delivery)}</span>`;
    $('#tGrand').textContent = money(sub + delivery);
  }

  function changeQty(id, d) {
    const it = state.cart.find(i => i.id === id);
    if (!it) return;
    it.qty += d;
    if (it.qty <= 0) state.cart = state.cart.filter(i => i.id !== id);
    saveCart();
  }

  async function submitOrder() {
    const name = $('#cName').value.trim();
    const phone = $('#cPhone').value.trim();
    const type = $('#cType').value;
    const address = $('#cAddr').value.trim();
    const note = $('#cNote').value.trim();
    if (!name || !phone) return push('Informe nome e telefone para continuar.');
    if (type === 'entrega' && !address) return push('Informe o endereço de entrega.');
    const btn = $('#placeOrder');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: state.cart,
          customer: { name, phone, type, address, note },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar pedido');
      state.cart = [];
      saveCart();
      closeCart();
      const link = `${location.origin}/track.html?id=${data.order.id}`;
      $('#cartBody').innerHTML = `
        <div class="success">
          <div class="big">✓</div>
          <h2>Pedido ${data.order.code} confirmado!</h2>
          <p class="muted">${data.order.statusLabel}. ${data.order.eta === '-' ? '' : 'Previsão: ' + data.order.eta + '.'}</p>
          <a class="track-link" href="${link}" target="_blank">Acompanhar pedido em tempo real</a>
          <p style="margin-top:18px" class="muted">Guarde este link para ver o status do seu pedido.</p>
        </div>`;
      if (navigator.share) {
        const s = document.createElement('button');
        s.className = 'btn';
        s.style.cssText = 'width:100%;justify-content:center;margin-top:10px';
        s.textContent = 'Compartilhar acompanhamento';
        s.onclick = () => navigator.share({ title: `Meu pedido ${data.order.code}`, url: link });
        $('#cartBody').appendChild(s);
      }
    } catch (e) {
      push(e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Fazer pedido';
    }
  }

  // ---------- IA chat ----------
  function openChat() {
    $('#chat').classList.remove('closed');
    state.hasMsg && setTimeout(() => $('#aiCount').style.display = 'none', 10);
  }
  function closeChat() { $('#chat').classList.add('closed'); }

  function addBubble(text, who) {
    const msgs = $('#msgs');
    const b = document.createElement('div');
    b.className = 'bubble ' + who;
    b.textContent = text;
    msgs.appendChild(b);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function initChat() {
    addBubble('Olá! Que bom te ver por aqui. Sou o atendente IA de bebidas. Me conta, o que você quer beber hoje?', 'bot');
  }

  async function sendMessage() {
    const input = $('#chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addBubble(text, 'user');
    $('#msgs').appendChild(document.createElement('div')).className = 'typing';
    $('#msgs').lastElementChild.textContent = 'digitando...';
    const last = $('#msgs').lastElementChild;
    try {
      const res = await fetch('/api/ai/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      last.remove();
      addBubble(data.reply, 'bot');
      if (data.items && data.items.length) {
        const btn = document.createElement('button');
        btn.className = 'btn primary small chat add-cart';
        btn.textContent = `Adicionar ao carrinho (${data.items.reduce((a, i) => a + i.qty, 0)} itens)`;
        btn.onclick = () => { addAISelection(data.items); };
        $('#msgs').appendChild(btn);
        $('#msgs').scrollTop = $('#msgs').scrollHeight;
        state.hasMsg = true;
        $('#aiCount').style.display = '';
      }
    } catch (e) {
      last.remove();
      addBubble('Ops, não consegui processar isso agora. Tente de novo em instantes.', 'bot');
    }
  }

  // ---------- Events ----------
  ['#btnIA', '#fabIA'].forEach(sel => $(sel).onclick = openChat);
  $('#closeChat').onclick = closeChat;
  $('#btnCart').onclick = openCart;
  $('#closeCart').onclick = closeCart;
  $('#sendMsg').onclick = sendMessage;
  $('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
  $('#overlay').onclick = () => { closeCart(); };

  const chips = document.querySelector('.chips');
  if (chips) chips.remove();

  function quickChips() {
    const box = document.createElement('div');
    box.className = 'chips';
    ['2 Heineken gelada', '1 suco de laranja', '3 Coca lata', 'qual o preço do vinho?'].forEach(t => {
      const b = document.createElement('button');
      b.textContent = t;
      b.onclick = () => { $('#chatInput').value = t; sendMessage(); };
      box.appendChild(b);
    });
    $('#chat').insertBefore(box, $('#chat').querySelector('.input-row'));
  }
  quickChips();

  function openCart() { $('#cartDrawer').classList.add('open'); $('#overlay').classList.add('open'); }
  function closeCart() { $('#cartDrawer').classList.remove('open'); $('#overlay').classList.remove('open'); }

  boot().catch(e => {
    $('#grid').innerHTML = '<div class="empty">Não consegui carregar o cardápio. Verifique se o servidor está rodando.</div>';
    console.error(e);
  });
  loadCart();
})();