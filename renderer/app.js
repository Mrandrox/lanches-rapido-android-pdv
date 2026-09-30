'use strict';

/* ============================================================
   App — núcleo: API, login/troca de conta, SSE, temas, navegação
   ============================================================ */
(function () {
  const $ = id => document.getElementById(id);

  const App = {
    base: 'http://localhost:4175',
    token: localStorage.getItem('lv_token') || '',
    user: null,
    data: { settings: {}, categories: [], products: [], customers: [], users: [], orders: [], cash: {} },
    screens: {},
    current: '',
    sse: null,
    sseRetry: 0,
    healthTimer: null,
  };
  window.App = App;

  // ---------------------------------------------------------- helpers
  function money(v) {
    const c = (App.data.settings.currency || 'R$');
    return c + ' ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }
  App.money = money;

  function dt(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  App.dt = dt;

  const STATUS = {
    open: { label: 'Novo', cls: 'open', emoji: '🕐' },
    preparing: { label: 'Preparando', cls: 'preparing', emoji: '🍳' },
    route: { label: 'Em rota', cls: 'route', emoji: '🛵' },
    delivered: { label: 'Entregue', cls: 'delivered', emoji: '✅' },
    finished: { label: 'Concluído', cls: 'finished', emoji: '🍔' },
    canceled: { label: 'Cancelado', cls: 'canceled', emoji: '❌' },
  };
  App.STATUS = STATUS;

  function badgeForOrder(o) {
    const s = STATUS[o.status] || STATUS.open;
    const t = o.type === 'delivery' ? 'delivery' : 'counter';
    return `<span class="badge ${s.cls}">${s.label}</span> <span class="badge ${t}">${o.type === 'delivery' ? '🚚 Entrega' : 'Balcão'}</span>`;
  }
  App.badgeForOrder = badgeForOrder;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  App.esc = esc;

  // ---------------------------------------------------------- API
  async function api(path, opts = {}) {
    const res = await fetch(App.base + path, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(App.token ? { Authorization: 'Bearer ' + App.token } : {}),
        ...(opts.headers || {}),
      },
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.error || data.message || 'Erro ' + res.status);
      e.status = res.status;
      throw e;
    }
    return data;
  }
  App.api = api;

  async function login(pin) {
    const d = await api('/api/login', { method: 'POST', body: { pin: String(pin).trim() } });
    App.token = d.token;
    localStorage.setItem('lv_token', App.token);
    App.user = d.user;
    await refresh();
    enterApp();
  }
  App.login = login;

  async function refresh() {
    App.data = await api('/api/bootstrap');
    applyTheme();
    updateHeader();
  }
  App.refresh = refresh;

  function logout() {
    if (App.sse) { App.sse.close(); App.sse = null; }
    App.token = '';
    App.user = null;
    localStorage.removeItem('lv_token');
    App.data = { settings: {}, categories: [], products: [], customers: [], users: [], orders: [], cash: {} };
    $('app').style.display = 'none';
    $('loginScreen').style.display = 'flex';
    pinInputs().forEach(i => i.value = '');
  }
  App.logout = logout;

  // ---------------------------------------------------------- tema + logo
  function applyTheme() {
    const t = App.data.settings.theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    const logo = App.data.settings.logo;
    const set = (img, emoji) => {
      if (logo) { img.src = logo; img.style.display = ''; emoji.style.display = 'none'; }
      else { img.style.display = 'none'; emoji.style.display = ''; }
    };
    set($('loginLogo'), $('loginEmoji'));
    const side = $('sideLogo');
    if (logo) { side.src = logo; side.style.display = ''; } else side.style.display = 'none';
    $('sideName').textContent = App.data.settings.name || 'Lanches';
    $('loginStore').textContent = App.data.settings.name || 'Lanches';
    $('screenTitle').textContent = 'PDV';
    document.title = (App.data.settings.name || 'Lanches') + ' - PDV';
  }
  App.applyTheme = applyTheme;

  // ---------------------------------------------------------- header
  function updateHeader() {
    const cash = App.data.cash || {};
    const el = $('cashStatus');
    if (cash.open) {
      el.className = 'cash-status open';
      el.textContent = '💰 Caixa aberto';
      el.title = 'Saldo: ' + money(cash.balance);
    } else {
      el.className = 'cash-status';
      el.textContent = '🔒 Caixa fechado';
    }
    if (App.user) {
      $('userName').textContent = App.user.name;
      const roleLabel = { admin: 'Administrador', operator: 'Operador', courier: 'Entregador' }[App.user.role] || App.user.role;
      $('userRole').textContent = roleLabel;
      const av = $('userAvatar');
      av.textContent = (App.user.name || '?').slice(0, 1).toUpperCase();
      av.style.background = App.user.color || '#64748b';
    }
    buildNav();
  }

  // ---------------------------------------------------------- nav
  function buildNav() {
    const nav = $('nav');
    const items = App.screens;
    nav.innerHTML = '';
    const roles = [App.user && App.user.role];
    Object.values(items).forEach(s => {
      if (s.roles && !s.roles.some(r => roles.includes(r))) return;
      const b = document.createElement('button');
      b.className = 'nav-item' + (s.id === App.current ? ' active' : '');
      b.innerHTML = `${s.icon} ${s.label}`;
      b.onclick = () => go(s.id);
      nav.appendChild(b);
    });
  }
  App.buildNav = buildNav;

  function registerScreen(s) {
    App.screens[s.id] = s;
  }
  App.registerScreen = registerScreen;

  function go(id) {
    const s = App.screens[id];
    if (!s) return;
    if (s.roles && App.user && !s.roles.some(r => App.user.role === r)) return;
    const prev = App.screens[App.current];
    if (prev && prev.hide) prev.hide();
    App.current = id;
    $('screenTitle').textContent = s.label;
    buildNav();
    s.show();
  }
  App.go = go;

  // ---------------------------------------------------------- sse (fetch stream)
  function connectSSE() {
    if (App.sse && App.sse.active) { App.sse.close(); App.sse = null; }
    const obj = { active: true, reader: null, close() { this.active = false; if (this.reader) { try { this.reader.cancel(); } catch (e) {} } } };
    App.sse = obj;
    const token = App.token;

    (async () => {
      try {
        const res = await fetch(App.base + '/api/sse?channels=orders', { headers: { Authorization: 'Bearer ' + token } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        if (!obj.active) return;
        const reader = res.body.getReader();
        obj.reader = reader;
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, idx).split('\n');
            buf = buf.slice(idx + 2);
            let event = 'message', data = '';
            for (const line of block) {
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            if (!data) continue;
            try {
              const payload = JSON.parse(data);
              if (event === 'order:new' || event === 'order' || event === 'location') handleEvent(event, payload);
            } catch (e) { /* ignora evento malformado */ }
          }
        }
      } catch (e) { /* abaixo */}
      if (obj.active) {
        obj.active = false;
        App.sse = null;
        App.sseRetry = Math.min(App.sseRetry + 1, 4);
        const t = 1500 * Math.pow(2, App.sseRetry);
        setTimeout(() => { if (App.token && App.user && !App.sse) connectSSE(); }, Math.min(t, 15000));
      }
    })();
  }

  function handleEvent(type, payload) {
    const mod = App.screens[App.current];
    if (App.screens.orders && App.screens.orders.onEvent) App.screens.orders.onEvent(type, payload);
    if (type === 'order:new' && payload.print && App.screens.pdv && App.screens.pdv.onPrint) {
      App.screens.pdv.onPrint(payload.order);
    }
    if (type === 'order' || type === 'order:new' || type === 'location') {
      refresh().catch(() => {});
    }
  }
  App.handleEvent = handleEvent;

  // ---------------------------------------------------------- pin pad
  function pinInputs() {
    return Array.from(document.querySelectorAll('#pinRow input'));
  }
  function buildPinpad() {
    const row = $('pinRow');
    row.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const inp = document.createElement('input');
      inp.maxLength = 1; inp.inputMode = 'numeric'; inp.autocomplete = 'off';
      inp.onkeydown = (e) => {
        if (/[0-9]/.test(e.key) && e.key.length === 1) {
          e.preventDefault();
          inp.value = e.key;
          const n = row.children[i + 1];
          if (n) n.focus(); else tryLogin();
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          inp.value = '';
          const p = row.children[i - 1];
          if (p) p.focus();
        } else if (e.key === 'Enter') {
          tryLogin();
        }
      };
      row.appendChild(inp);
    }
    const pad = $('pinpad');
    pad.innerHTML = '';
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].forEach(k => {
      const b = document.createElement('button');
      b.textContent = k === 'del' ? '⌫' : k === 'ok' ? '✓' : k;
      b.onclick = () => {
        if (k === 'ok') return tryLogin();
        if (k === 'del') {
          for (let i = row.children.length - 1; i >= 0; i--) {
            if (row.children[i].value) { row.children[i].value = ''; row.children[i].focus(); return; }
          }
          return;
        }
        for (const inp of row.children) { if (!inp.value) { inp.value = k; break; } }
        if (Array.from(row.children).every(i => i.value)) tryLogin();
      };
      pad.appendChild(b);
    });
  }

  async function tryLogin() {
    const pin = pinInputs().map(i => i.value).join('');
    if (pin.length < 4) { $('loginErr').textContent = 'Digite o PIN completo.'; return; }
    const btn = $('loginBtn');
    btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      await login(pin);
    } catch (e) {
      $('loginErr').textContent = e.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  }

  // ---------------------------------------------------------- enter app
  function enterApp() {
    $('loginScreen').style.display = 'none';
    $('app').style.display = 'flex';
    applyTheme();
    updateHeader();
    connectSSE();
    const first = App.user.role === 'courier' ? 'orders' : (App.screens.pdv.roles.includes(App.user.role) ? 'pdv' : 'orders');
    const start = App.screens[first] ? first : 'pdv';
    go(start);
  }

  // ---------------------------------------------------------- modal + toast
  function modal(html, { onMount } = {}) {
    $('modalBox').innerHTML = `<button class="close-x" data-x>✕</button>${html}`;
    $('modalBackdrop').style.display = 'flex';
    const close = () => { $('modalBackdrop').style.display = 'none'; };
    $('modalBox').querySelectorAll('[data-x]').forEach(b => b.onclick = close);
    $('modalBackdrop').onclick = (e) => { if (e.target === $('modalBackdrop')) close(); };
    if (onMount) onMount($('modalBox'), close);
    return close;
  }
  App.modal = modal;
  App.closeModal = () => { $('modalBackdrop').style.display = 'none'; };

  let toastTimer = null;
  function toast(msg, isErr) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }
  App.toast = toast;

  // ---------------------------------------------------------- health check
  function healthTick() {
    fetch(App.base + '/api/health').then(r => r.ok).catch(() => false).then(ok => {
      const el = $('serverStatus');
      el.className = 'server-status' + (ok ? ' ok' : '');
      if (!ok) el.title = 'Servidor offline — tente reiniciar o app';
    });
  }

  // ---------------------------------------------------------- boot
  function decideBase() {
    return (window.lv && window.lv.serverStatus)
      ? window.lv.serverStatus().then(s => {
          if (s && s.url) App.base = s.url;
          App.serverPort = s && s.port ? s.port : 4175;
          return App.base;
        }).catch(() => { App.serverPort = 4175; return App.base; })
      : Promise.resolve(App.base);
  }

  async function boot() {
    buildPinpad();
    $('logoutBtn').onclick = () => { logout(); App.toast('Conta alterada. Faça login novamente.'); };
    $('loginBtn').onclick = () => tryLogin();
    await decideBase();

    healthTick();
    setInterval(healthTick, 12000);

    if (App.token) {
      try {
        const me = await api('/api/me');
        App.user = me.user;
        await refresh();
        enterApp();
        return;
      } catch (e) {
        App.token = '';
        localStorage.removeItem('lv_token');
      }
    }
    $('loginScreen').style.display = 'flex';
  }

  boot();
})();