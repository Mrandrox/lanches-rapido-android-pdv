'use strict';

/* ============================================================
   Configurações — aparência/logo, contas, IA + WhatsApp, impressora
   ============================================================ */
(function () {
  const App = window.App;
  const st = { tab: 'appearance' };
  let waSource = null;

  function show() {
    render();
    connectWa();
  }
  function hide() {
    if (waSource) { try { waSource.close(); } catch (e) {} waSource = null; }
  }

  function render() {
    const root = document.getElementById('screenContent');
    const s = App.data.settings;
    root.innerHTML = `
      <div class="cfg-tabs">
        ${[['appearance', '🎨 Aparência'], ['accounts', '👥 Contas'], ['delivery', '🛵 Delivery'], ['ai', '🤖 IA + WhatsApp'], ['printer', '🖨️ Impressora']].map(([id, l]) =>
          `<button class="cfg-tab ${st.tab === id ? 'active' : ''}" onclick="window.__cfg.tab('${id}')">${l}</button>`).join('')}
      </div>
      <div class="cfg-section">${tabContent(s)}</div>`;
    bindTabHandlers(s);
  }

  // ------------------------------------------------------------ aparência
  function appearanceContent(s) {
    return `
      <div class="card mb">
        <h3 class="section-title">🥇 Identidade visual</h3>
        <div class="row mb" style="align-items:flex-start">
          <img id="logoPrev" class="logo-preview" src="${s.logo || ''}" style="${s.logo ? '' : 'display:none'}">
          <div style="flex:1">
            <div class="row mb">
              <button class="btn" onclick="window.__cfg.pickLogo()">📷 Escolher logo (imagem)</button>
              ${s.logo ? '<button class="btn btn-ghost" onclick="window.__cfg.clearLogo()">Remover</button>' : ''}
            </div>
            <input id="logoUrl" placeholder="…ou cole uma URL de imagem" value="${App.esc(s.logo || '')}">
          </div>
        </div>
        <div class="field"><label>Nome da loja</label><input id="sName" value="${App.esc(s.name || '')}" placeholder="Lanches Rápido"></div>
        <div class="field"><label>Telefone (WhatsApp)</label><input id="sPhone" value="${App.esc(s.phone || '')}" placeholder="(11) 99999-9999"></div>
        <div class="field"><label>Endereço da loja</label><input id="sAddr" value="${App.esc(s.address || '')}"></div>
        <div class="row">
          <div class="field" style="flex:1"><label>Moeda</label><input id="sCur" value="${App.esc(s.currency || 'R$')}"></div>
          <div class="field" style="flex:1"><label>Tema</label>
            <select id="sTheme">
              <option value="dark" ${s.theme !== 'light' ? 'selected' : ''}>🌙 Escuro</option>
              <option value="light" ${s.theme === 'light' ? 'selected' : ''}>☀️ Claro</option>
            </select>
          </div>
        </div>
        <div class="modal-actions" style="margin:0"><button class="btn btn-primary" onclick="window.__cfg.saveAppearance()">💾 Salvar</button></div>
      </div>
      <div class="card">
        <h3 class="section-title">🔗 Links públicos (enviar para clientes/entregadores)</h3>
        <p class="muted" style="font-size:12px;margin-bottom:8px">Na rede local, troque <code>localhost</code> pelo IP desta máquina (ex.: <code>http://192.168.0.10:${(App.serverPort || 4175)}</code>).</p>
        <div class="field"><label>App do entregador</label><input readonly value="${App.base}/courier"></div>
        <div class="field"><label>Rastreio (por pedido)</label><input readonly value="${App.base}/track/#ID (gerado em cada pedido)"></div>
      </div>`;
  }

  // ------------------------------------------------------------ contas
  function accountsContent() {
    const users = App.data.users;
    const canDelete = (u) => !(u.role === 'admin' && users.filter(x => x.role === 'admin' && x.active !== false).length <= 1);
    return `
      <div class="card">
        <div class="row-between mb">
          <h3 class="section-title" style="margin:0">Usuários e cargos</h3>
          <button class="btn btn-primary" onclick="window.__cfg.userNew()">＋ Usuário</button>
        </div>
        <table class="table">
          <thead><tr><th>Nome</th><th>Cargo</th><th>PIN</th><th>Status</th><th class="actions">Ações</th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr style="opacity:${u.active === false ? '.5' : '1'}">
                <td><span class="avatar" style="width:24px;height:24px;font-size:11px;display:inline-grid;background:${u.color || '#64748b'};vertical-align:middle;margin-right:6px">${App.esc((u.name || '?').slice(0, 1))}</span><b>${App.esc(u.name)}</b></td>
                <td><span class="badge role-${u.role}">${App.esc({ admin: 'Administrador', operator: 'Operador', courier: 'Entregador' }[u.role] || u.role)}</span></td>
                <td class="muted">••••</td>
                <td>${u.active === false ? '<span class="badge canceled">Inativo</span>' : '<span class="badge delivered">Ativo</span>'}</td>
                <td class="actions">
                  <button class="icon-btn" onclick="window.__cfg.userToggle('${u.id}')">${u.active === false ? 'Ativar' : 'Desativar'}</button>
                  <button class="icon-btn" onclick="window.__cfg.userEdit('${u.id}')">✏️</button>
                  ${canDelete(u) ? `<button class="icon-btn" onclick="window.__cfg.userDel('${u.id}')">🗑️</button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
        <p class="muted mt">Entregador entra no <b>${App.base}/courier</b> (pelo celular) com o mesmo PIN.</p>
      </div>`;
  }

  function userForm(u) {
    u = u || {};
    return `
      <h3>${u.id ? 'Editar usuário' : 'Novo usuário'}</h3>
      <div class="field"><label>Nome *</label><input id="uName" value="${App.esc(u.name || '')}"></div>
      <div class="row">
        <div class="field" style="flex:1"><label>PIN (4 a 6 dígitos) *</label><input id="uPin" value="" placeholder="${u.id ? 'Deixe vazio para manter' : '0000'}" inputmode="numeric"></div>
        <div class="field" style="flex:1"><label>Cargo</label>
          <select id="uRole">
            <option value="operator" ${u.role === 'operator' ? 'selected' : ''}>Operador</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option>
            <option value="courier" ${u.role === 'courier' ? 'selected' : ''}>Entregador</option>
          </select>
        </div>
      </div>
      <div class="field"><label>Cor do avatar</label><input id="uColor" type="color" value="${u.color || '#64748b'}" style="width:60px;height:38px;padding:4px"></div>
      <p class="muted" style="font-size:12px">Administrador gerencia tudo. Operador faz vendas. Entregador só entrega.</p>
      <div class="modal-actions">
        <button class="btn" data-x>Cancelar</button>
        <button class="btn btn-primary" onclick="window.__cfg.userSave('${u.id || ''}')">Salvar</button>
      </div>`;
  }

  // ------------------------------------------------------------ delivery
  function deliveryContent(s) {
    return `
      <div class="card">
        <h3 class="section-title">🛵 Delivery</h3>
        <div class="field"><label>Taxa de entrega padrão (R$)</label><input id="dFee" type="number" step="0.5" min="0" value="${s.deliveryFee ?? 0}"></div>
        <div class="row">
          <div class="field" style="flex:1"><label>Latitude da loja (para o mapa)</label><input id="dLat" type="number" step="0.0001" value="${s.storeLat ?? ''}"></div>
          <div class="field" style="flex:1"><label>Longitude da loja</label><input id="dLng" type="number" step="0.0001" value="${s.storeLng ?? ''}"></div>
        </div>
        <p class="muted" style="font-size:12px">Reflita a localização real da loja — o cliente a vê no mapa de rastreio. Deixe 0,0 se o endereço não importar.</p>
        <div class="modal-actions" style="margin:0"><button class="btn btn-primary" onclick="window.__cfg.saveDelivery()">💾 Salvar</button></div>
      </div>
      <div class="card">
        <h3 class="section-title">📱 Aplicativo de pedidos (Android/App)</h3>
        <div class="row">
          <label class="switch"><input id="dAppOn" type="checkbox" ${(s.orderApp && s.orderApp.enabled !== false) ? 'checked' : ''}><span>Cliente pode pedir pelo app</span></label>
        </div>
        <div class="field"><label>Aviso exibido no app (opcional)</label><input id="dAppMsg" value="${App.esc((s.orderApp && s.orderApp.announcement) || '')}" placeholder="Ex.: Fechamos às 23h"></div>
        <div class="modal-actions" style="margin:0"><button class="btn btn-primary" onclick="window.__cfg.saveAppOrder()">💾 Salvar</button></div>
        <p class="muted" style="font-size:11px;margin-top:6px">Pedidos feitos no app caem aqui no PDV em tempo real e imprimem o atendimento igual aos do WhatsApp. Endereço do app: <b>http://&lt;IP-da-loja&gt;:4175</b></p>
      </div>`;
  }

  // ------------------------------------------------------------ IA + WhatsApp
  function aiContent(s) {
    const ai = s.ai || {};
    const wa = s.wa || {};
    return `
      <div class="card mb">
        <h3 class="section-title">🤖 Inteligência Artificial (interpreta pedidos no WhatsApp)</h3>
        <div class="row">
          <div class="field" style="flex:1"><label>Provedor</label>
            <select id="aiProv">
              <option value="openai" ${ai.provider !== 'custom' ? 'selected' : ''}>OpenAI</option>
              <option value="custom" ${ai.provider === 'custom' ? 'selected' : ''}>Compatível (Ollama, etc.)</option>
            </select>
          </div>
          <div class="field" style="flex:1"><label>URL base</label><input id="aiUrl" value="${App.esc(ai.baseUrl || 'https://api.openai.com/v1')}"></div>
        </div>
        <div class="field"><label>Chave da API</label><input id="aiKey" type="password" value="${App.esc(ai.apiKey || '')}" placeholder="sk-…"><div class="muted" style="font-size:11px;margin-top:4px">Sem chave, o app usa o reconhecimento local (bom o suficiente). Modelos como gpt-4o-mini entendem qualquer mensagem.</div></div>
        <div class="field"><label>Modelo</label><input id="aiModel" value="${App.esc(ai.model || 'gpt-4o-mini')}"></div>
        <div class="row">
          <button class="btn" onclick="window.__cfg.aiSave()">💾 Salvar IA</button>
          <button class="btn btn-ghost" onclick="window.__cfg.aiTest()">🧪 Testar conexão</button>
        </div>
        <div id="aiResult" class="muted" style="font-size:12px;margin-top:8px"></div>
      </div>

      <div class="card">
        <h3 class="section-title">💬 WhatsApp (pedidos automáticos)</h3>
        <div class="wa-banner" id="waBanner"><b>Status:</b> <span id="waStatus">—</span></div>
        <div id="waQr" style="text-align:center"></div>
        <div class="row">
          <button class="btn btn-primary" onclick="window.__cfg.waConnect()">🔌 Conectar WhatsApp</button>
          <button class="btn btn-ghost" onclick="window.__cfg.waStop()">⏹ Desconectar</button>
        </div>
        <p class="muted" style="font-size:12px;margin-top:8px">
          O WhatsApp fica conectado neste servidor. Os clientes mandam mensagem como "2 xburger e 1 coca na rua X" e a IA monta o pedido automaticamente.
          <br>Requer: <code>npm install whatsapp-web.js</code> (uma vez). Sem o pacote, use o teste abaixo.
        </p>
        <div class="field mt"><label>Pedido por IA (testar / sem WhatsApp)</label><textarea id="waMsg" rows="2" placeholder='Ex.: "bom dia, quero 2 X-Burger e 1 Refrigerante Lata, entregar na rua das Acácias 100"'>${App.esc(st.lastMsg || '')}</textarea></div>
        <div class="row">
          <button class="btn" onclick="window.__cfg.aiParse()">🔍 Interpretar</button>
          <button class="btn btn-primary" onclick="window.__cfg.aiCreate()">📦 Criar pedido</button>
        </div>
        <div id="aiParseOut" class="muted" style="font-size:12px;margin-top:8px"></div>
      </div>`;
  }

  // ------------------------------------------------------------ impressora
  function printerContent(s) {
    const pr = s.printer || {};
    return `
      <div class="card">
        <h3 class="section-title">🖨️ Impressora térmica 80mm</h3>
        <div class="field"><label>Impressora</label>
          <div class="row">
            <select id="pSel" style="flex:1"><option value="">Carregando impressoras…</option></select>
            <button id="pRefresh" class="btn btn-ghost" onclick="window.__cfg.loadPrinters(true)">⟳</button>
          </div>
          <div class="muted" style="font-size:11px;margin-top:4px">Instale a térmica com driver ESC/POS ou "Generic/Text Only" no Windows.</div>
        </div>
        <div class="field"><label>Nº de cópias</label><input id="pCopies" type="number" min="1" max="5" value="${pr.copies || 1}"></div>
        <div class="row">
          <button class="btn btn-primary" onclick="window.__cfg.savePrinter()">💾 Salvar</button>
          <button class="btn btn-ghost" onclick="window.__cfg.testPrint()">🧾 Impressão de teste</button>
        </div>
      </div>`;
  }

  function tabContent(s) {
    return {
      appearance: appearanceContent(s),
      accounts: accountsContent(),
      delivery: deliveryContent(s),
      ai: aiContent(s),
      printer: printerContent(s),
    }[st.tab];
  }

  function bindTabHandlers(s) {
    if (st.tab === 'printer') {
      const sel = document.getElementById('pSel');
      const saved = (s.printer && s.printer.name) || '';
      const load = () => {
        if (!window.lv || !window.lv.printers) { sel.innerHTML = '<option value="">Impressão só disponível no app desktop</option>'; return; }
        window.lv.printers().then(list => {
          sel.innerHTML = '<option value="">(padrão do sistema)</option>' +
            list.map(p => `<option value="${App.esc(p.name)}" ${p.name === saved ? 'selected' : ''}>${App.esc(p.name)}</option>`).join('');
          const cur = list.find(p => p.name === saved);
          sel.value = saved || '';
          if (!saved && cur) sel.value = cur.name;
        }).catch(() => { sel.innerHTML = '<option value="">Nenhuma impressora detectada</option>'; });
      };
      load();
      window.__cfg.loadPrinters = load;
      window.__cfg.savePrinter = async () => {
        const name = sel.value;
        const copies = parseInt(document.getElementById('pCopies').value, 10) || 1;
        try {
          await App.api('/api/settings', { method: 'POST', body: { printer: { name, copies } } });
          await App.refresh();
          App.toast('Impressora salva ✅');
        } catch (e) { App.toast(e.message, true); }
      };
      window.__cfg.testPrint = () => {
        const order = {
          id: 'test', number: 'TESTE', type: 'counter', customer: 'Teste', phone: '', address: '',
          items: [{ name: 'X-Burger', qty: 1, total: 15 }, { name: 'Refrigerante Lata', qty: 1, total: 6 }],
          subtotal: 21, discount: 0, deliveryFee: 0, total: 21, payment: 'Dinheiro', note: 'Impressão de teste',
        };
        App.printOrder(order, 'venda');
      };
    }
    if (st.tab === 'appearance') {
      window.__cfg.pickLogo = async () => {
        if (window.lv && window.lv.pickLogo) {
          const dataUrl = await window.lv.pickLogo();
          if (dataUrl) { document.getElementById('logoUrl').value = dataUrl; showLogo(dataUrl); }
        } else {
          const f = document.createElement('input');
          f.type = 'file'; f.accept = 'image/*';
          f.onchange = () => {
            const file = f.files[0];
            if (!file) return;
            const r = new FileReader();
            r.onload = () => { document.getElementById('logoUrl').value = r.result; showLogo(r.result); };
            r.readAsDataURL(file);
          };
          f.click();
        }
      };
      window.__cfg.clearLogo = () => {
        document.getElementById('logoUrl').value = '';
        document.getElementById('logoPrev').style.display = 'none';
      };
      const logoUrl = document.getElementById('logoUrl');
      logoUrl.onchange = () => showLogo(logoUrl.value.trim());
      function showLogo(url) {
        const img = document.getElementById('logoPrev');
        img.src = url; img.style.display = '';
      }
      window.__cfg.saveAppearance = async () => {
        const g = id => document.getElementById(id).value.trim();
        const body = {
          name: g('sName'),
          phone: g('sPhone'),
          address: g('sAddr'),
          currency: g('sCur') || 'R$',
          theme: document.getElementById('sTheme').value,
          logo: document.getElementById('logoUrl').value.trim(),
        };
        if (!body.name) return App.toast('Informe o nome da loja.', true);
        try {
          await App.api('/api/settings', { method: 'POST', body });
          await App.refresh();
          App.toast('Aparência salva ✅');
        } catch (e) { App.toast(e.message, true); }
      };
    }
    if (st.tab === 'accounts') {
      window.__cfg.userNew = () => App.modal(userForm());
      window.__cfg.userEdit = (id) => App.modal(userForm(App.data.users.find(u => u.id === id)));
      window.__cfg.userSave = async (id) => {
        const name = document.getElementById('uName').value.trim();
        const pin = document.getElementById('uPin').value.trim();
        const role = document.getElementById('uRole').value;
        const color = document.getElementById('uColor').value;
        if (!name) return App.toast('Informe o nome.', true);
        if (!id && (!pin || pin.length < 4)) return App.toast('PIN obrigatório (mín. 4 dígitos).', true);
        const body = { name, role, color, ...(pin ? { pin } : {}) };
        try {
          if (id) await App.api('/api/users/' + id, { method: 'PUT', body });
          else await App.api('/api/users', { method: 'POST', body });
          await App.refresh();
          App.closeModal(); render();
          App.toast('Usuário salvo ✅');
        } catch (e) { App.toast(e.message, true); }
      };
      window.__cfg.userToggle = async (id) => {
        const u = App.data.users.find(x => x.id === id);
        if (!u) return;
        if ((u.role === 'admin' && u.active !== false) && App.data.users.filter(x => x.role === 'admin' && x.active !== false).length <= 1) {
          return App.toast('Não desative o último administrador.', true);
        }
        try {
          await App.api('/api/users/' + id, { method: 'PUT', body: { active: u.active === false } });
          await App.refresh(); render();
        } catch (e) { App.toast(e.message, true); }
      };
      window.__cfg.userDel = async (id) => {
        const u = App.data.users.find(x => x.id === id);
        if (!u) return;
        if (u.role === 'admin' && App.data.users.filter(x => x.role === 'admin' && x.active !== false).length <= 1) {
          return App.toast('Não exclua o último administrador.', true);
        }
        if (!confirm('Excluir ' + u.name + '?')) return;
        try {
          await App.api('/api/users/' + id, { method: 'DELETE' });
          await App.refresh(); render(); App.toast('Usuário excluído.');
        } catch (e) { App.toast(e.message, true); }
      };
    }
    if (st.tab === 'delivery') {
      window.__cfg.saveDelivery = async () => {
        const lat = parseFloat(document.getElementById('dLat').value);
        const lng = parseFloat(document.getElementById('dLng').value);
        const fee = parseFloat(document.getElementById('dFee').value);
        try {
          await App.api('/api/settings', { method: 'POST', body: { deliveryFee: fee || 0, storeLat: isNaN(lat) ? 0 : lat, storeLng: isNaN(lng) ? 0 : lng } });
          await App.refresh();
          App.toast('Configuração de delivery salva ✅');
        } catch (e) { App.toast(e.message, true); }
      };
      window.__cfg.saveAppOrder = async () => {
        const enabled = document.getElementById('dAppOn').checked;
        const announcement = document.getElementById('dAppMsg').value || '';
        try {
          await App.api('/api/settings', { method: 'POST', body: { orderApp: { enabled, announcement } } });
          await App.refresh();
          App.toast('Aplicativo de pedidos salvo ✅');
        } catch (e) { App.toast(e.message, true); }
      };
    }
    if (st.tab === 'ai') {
      window.__cfg.aiSave = async () => {
        const g = id => document.getElementById(id).value.trim();
        const body = {
          ai: {
            provider: document.getElementById('aiProv').value,
            baseUrl: g('aiUrl') || 'https://api.openai.com/v1',
            apiKey: g('aiKey'),
            model: g('aiModel') || 'gpt-4o-mini',
          },
        };
        try {
          await App.api('/api/settings', { method: 'POST', body });
          await App.refresh();
          document.getElementById('aiResult').textContent = 'IA salva ✅';
          App.toast('IA salva ✅');
        } catch (e) { App.toast(e.message, true); }
      };
      window.__cfg.aiTest = async () => {
        const r = document.getElementById('aiResult');
        r.textContent = 'Testando…';
        try {
          const res = await App.api('/api/ai/test', { method: 'POST' });
          r.textContent = res.ok ? '✅ ' + res.message : '⚠️ ' + res.message;
        } catch (e) { r.textContent = 'Erro: ' + e.message; }
      };
      window.__cfg.aiParse = async () => {
        const text = document.getElementById('waMsg').value.trim();
        const out = document.getElementById('aiParseOut');
        st.lastMsg = text;
        if (!text) return App.toast('Cole uma mensagem.', true);
        out.innerHTML = 'Interpretando…';
        try {
          const r = await App.api('/api/ai/parse', { method: 'POST', body: { text } });
          if (!r.items.length) { out.innerHTML = '<span style="color:var(--danger)">Não consegui encontrar produtos no cardápio.</span>'; return; }
          const total = r.items.reduce((s, i) => s + i.total, 0);
          out.innerHTML = `<b>Pedido interpretado</b>${r.local ? ' <span class="muted">(modo local)</span>' : ''}:<br>` +
            r.items.map(i => `${i.qty}× ${App.esc(i.name)} — ${money(i.total)}`).join('<br>') + `<br><b>Total: ${money(total)}</b><br>` +
            (r.customer ? `Cliente: ${App.esc(r.customer)} · ` : '') + (r.address ? `Endereço: ${App.esc(r.address)}` : '');
        } catch (e) { out.innerHTML = '<span style="color:var(--danger)">' + App.esc(e.message) + '</span>'; }
      };
      window.__cfg.aiCreate = async () => {
        const text = document.getElementById('waMsg').value.trim();
        st.lastMsg = text;
        if (!text) return App.toast('Cole uma mensagem.', true);
        try {
          const r = await App.api('/api/ai/parse', { method: 'POST', body: { text } });
          if (!r.items.length) return App.toast('Nenhum produto identificado.', true);
          const order = await App.api('/api/orders', {
            method: 'POST',
            body: { type: 'delivery', items: r.items, customer: r.customer || 'Cliente IA', address: r.address || '', note: r.note || '', payment: 'Pendente', print: true, source: 'whatsapp' },
          });
          App.toast('Pedido #' + order.number + ' criado 🚚');
          App.go('orders');
        } catch (e) { App.toast(e.message, true); }
      };
    }
  }

  // ------------------------------------------------------------ WhatsApp SSE
  function waStatusLabel() {
    const el = document.getElementById('waStatus');
    try {
      App.api('/api/wa/status').then(s => {
        const labels = {
          off: 'Desconectado', nolib: 'Pacote não instalado (npm install whatsapp-web.js)',
          starting: 'Iniciando…', qr: 'Escaneie o QR code abaixo (WhatsApp > Aparelhos conectados)',
          authenticated: 'Autenticado, sincronizando…', ready: '✅ Conectado!', failed: 'Falha na autenticação', disconnected: 'Desconectado',
        };
        if (el) el.textContent = labels[s.status] || s.status;
      }).catch(() => {});
    } catch (e) { /* ignora */ }
  }

  function connectWa() {
    if (st.tab !== 'ai' || !App.token) return;
    if (waSource) return;
    const controller = new AbortController();
    let active = true;
    const run = async () => {
      try {
        waStatusLabel();
        const res = await fetch(App.base + '/api/sse?channels=wa', {
          headers: { Authorization: 'Bearer ' + App.token }, signal: controller.signal,
        });
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i).split('\n');
            buf = buf.slice(i + 2);
            let ev = 'message', data = '';
            for (const line of block) {
              if (line.startsWith('event:')) ev = line.slice(6).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            if (!data) continue;
            const p = JSON.parse(data);
            const qrEl = document.getElementById('waQr');
            const stEl = document.getElementById('waStatus');
            if (ev === 'qr' && qrEl) {
              qrEl.innerHTML = `<div class="muted" style="font-size:12px;margin-bottom:6px">Abra o WhatsApp no celular → Aparelhos conectados → escaneie</div><img src="${p}" style="width:200px;border-radius:12px;border:1px solid var(--line)">`;
              if (stEl) stEl.textContent = 'Escaneie o QR code';
            } else if (ev === 'ready') {
              if (qrEl) qrEl.innerHTML = '<div style="font-size:30px;margin:8px 0">✅</div>';
              if (stEl) stEl.textContent = '✅ Conectado!';
              App.toast('WhatsApp conectado! 💬');
            } else if (ev === 'status' || ev === 'disconnected' || ev === 'failed' || ev === 'nolib' || ev === 'authenticated') {
              if (stEl) stEl.textContent = (p.message ? p.message + ' — ' : '') + ({ off: 'Desconectado', starting: 'Iniciando…', nolib: 'Instale whatsapp-web.js', failed: 'Falha', disconnected: 'Desconectado', authenticated: 'Autenticando…' }[p.status || ev] || ev);
            } else if (ev === 'message') {
              if (stEl) stEl.textContent = 'Mensagem do cliente processada…';
            } else if (ev === 'order') {
              App.toast('Pedido do WhatsApp criado! 🚚');
              await App.refresh();
            } else if (ev === 'noitems') {
              App.toast('Mensagem sem itens reconhecidos 😕', true);
            }
          }
        }
      } catch (e) { /* desconecta */ }
      if (active) {
        active = false;
        setTimeout(connectWa, 3000);
      }
    };
    waSource = {
      close: () => { active = false; try { controller.abort(); } catch (e) {} },
    };
    run();
  }

  window.__cfg = {
    tab(id) { st.tab = id; render(); },
    async waConnect() {
      try {
        await App.api('/api/wa/connect', { method: 'POST' });
        waStatusLabel();
      } catch (e) { App.toast(e.message, true); }
    },
    async waStop() {
      try {
        await App.api('/api/wa/disconnect', { method: 'POST' });
        const qrEl = document.getElementById('waQr');
        if (qrEl) qrEl.innerHTML = '';
        App.toast('WhatsApp desconectado.');
        render();
      } catch (e) { App.toast(e.message, true); }
    },
  };

  // pega a porta para exibir links (preenchido pelo boot)
  App.registerScreen({ id: 'settings', label: 'Configurações', icon: '⚙️', roles: ['admin'], show, hide });
})();