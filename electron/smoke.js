'use strict';

const { app } = require('electron');

// Smoke test: liga o app, conecta ao servidor, faz login e navega nas telas.
function run(mainWindow) {
  const errors = [];
  console.log('SMOKE-BOOT');
  mainWindow.webContents.on('console-message', (e, level, message) => {
    const lvl = typeof e === 'object' && e.level !== undefined ? e.level : level;
    const msg = typeof e === 'object' && e.message !== undefined ? e.message : message;
    if (lvl === 3 || lvl === 'error' || String(lvl) === '3') errors.push(String(msg));
  });

  mainWindow.webContents.once('did-finish-load', async () => {
    console.log('SMOKE-LOADED');
    await new Promise(r => setTimeout(r, 2500));
    try {
      const res = await mainWindow.webContents.executeJavaScript(`
        (async () => {
          const out = [];
          out.push('App=' + typeof App);
          out.push('apiFunc=' + typeof App.api);
          if (typeof App !== 'object' || typeof App.api !== 'function') return out.join('|');
          // garante que o servidor está no ar e loga
          const s = await App.api('/api/health').then(r => r.name).catch(e => 'ERR:' + e.message);
          out.push('health=' + s);
          await App.login('1234');
          out.push('user=' + (App.user ? App.user.name + '@' + App.user.role : 'SEM-USER'));
          out.push('current=' + App.current);
          out.push('data.orders=' + App.data.orders.length);
          out.push('data.products=' + App.data.products.length);
          out.push('nav=' + Object.keys(App.screens).join(','));
          for (const id of ['pdv','orders','menu','customers','cash','reports','settings','pdv']) {
            if (!App.screens[id]) continue;
            try { App.go(id); await new Promise(r=>setTimeout(r,80)); out.push('nav-ok:'+id); }
            catch (e) { out.push('NAV-ERR:' + id + ':' + e.message); }
          }
          // fluxo de venda via UI (testa handlers inline)
          try {
            App.go('pdv');
            await new Promise(r=>setTimeout(r,120));
            const prod = document.querySelector('.prod-grid .prod');
            if (!prod) { out.push('SALE-NO-PRODS'); }
            else {
              prod.click();
              await new Promise(r=>setTimeout(r,100));
              const cartItem = document.querySelectorAll('.cart-item').length;
              out.push('cart-items=' + cartItem);
              const fin = document.querySelector('.cart-form .btn-primary');
              fin.click();
              await new Promise(r=>setTimeout(r,400));
              const order = App.data.orders[0];
              out.push('sale-ok=' + (order ? ('#' + order.number + ' total=' + order.total) : 'NONE'));
            }
          } catch (e) { out.push('SALE-ERR:' + e.message); }
          return out.join('|');
        })()
      `, true);
      console.log('SMOKE RESULT:\n' + String(res).replace(/\|/g, '\n'));
    } catch (e) {
      console.log('SMOKE EXEC-ERR: ' + e.message);
      errors.push('executeJavaScript falhou: ' + e.message);
    }
    if (errors.length) console.log('RENDERER ERROR LOG:\n' + errors.join('\n'));
    else console.log('RENDERER OK (sem erros de console)');
    app.exit(errors.length ? 2 : 0);
  });
}

module.exports = { run };