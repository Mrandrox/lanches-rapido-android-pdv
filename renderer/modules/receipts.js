'use strict';

/* ============================================================
   Receipts — formação de cupons 80mm + impressão
   ============================================================ */
(function () {
  const App = window.App;

  function money(v) {
    return App.money(v);
  }

  function storeHeader(settings) {
    const logo = settings.logo
      ? `<img src="${settings.logo}" style="width:56px;height:56px;object-fit:contain;margin:0 auto 4px">`
      : '';
    return `
      ${logo}
      <div style="font-size:15px;font-weight:800">${App.esc(settings.name)}</div>
      ${settings.address ? `<div style="font-size:11px">${App.esc(settings.address)}</div>` : ''}
      ${settings.phone ? `<div style="font-size:11px">${App.esc(settings.phone)}</div>` : ''}
      <br>`;
  }

  function orderLines(order) {
    let html = '';
    order.items.forEach(i => {
      html += `
        <tr>
          <td style="font-size:11px">${i.qty} x ${App.esc(i.name)}</td>
          <td style="font-size:11px;text-align:right">${money(i.total)}</td>
        </tr>`;
    });
    return html;
  }

  function totals(order) {
    return `
      ${order.discount > 0 ? `<tr><td style="font-size:11px">Subtotal</td><td style="font-size:11px;text-align:right">${money(order.subtotal)}</td></tr>` : ''}
      ${order.discount > 0 ? `<tr><td style="font-size:11px">Desconto</td><td style="font-size:11px;text-align:right">-${money(order.discount)}</td></tr>` : ''}
      ${order.deliveryFee > 0 ? `<tr><td style="font-size:11px">Taxa de entrega</td><td style="font-size:11px;text-align:right">${money(order.deliveryFee)}</td></tr>` : ''}
      <tr><td style="font-size:13px;font-weight:800">TOTAL</td><td style="font-size:13px;font-weight:800;text-align:right">${money(order.total)}</td></tr>`;
  }

  function receiptDoc(order, settings, kind) {
    const now = new Date();
    const dateLine = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    const isDelivery = order.type === 'delivery';
    const title = kind === 'cozinha' ? '⚠️ ATENDIMENTO' : 'venda';
    const trackLink = `${App.base}/track/${order.id}`;

    let extra = '';
    if (kind === 'cozinha') {
      extra = `
        <div style="text-align:center;font-weight:800;margin:6px 0">COZINHA</div>
        ${isDelivery
          ? `<div style="font-size:11px"><b>Cliente:</b> ${App.esc(order.customer)}</div>
             <div style="font-size:11px"><b>Entrega:</b> ${App.esc(order.address) || '—'}</div>`
          : `<div style="font-size:11px"><b>Cliente:</b> ${App.esc(order.customer)}</div>`}
        ${order.note ? `<div style="font-size:11px"><b>Obs:</b> ${App.esc(order.note)}</div>` : ''}
        <div style="font-size:10px;margin-top:4px">${App.badgeForOrder(order).replace(/<[^>]+>/g, ' ')}</div>`;
    } else {
      extra = `
        <div style="font-size:11px"><b>Cliente:</b> ${App.esc(order.customer)}</div>
        ${order.phone ? `<div style="font-size:11px"><b>Telefone:</b> ${App.esc(order.phone)}</div>` : ''}
        ${isDelivery ? `<div style="font-size:11px"><b>Entrega:</b> ${App.esc(order.address) || '—'}</div>` : ''}
        <div style="font-size:11px"><b>Pagamento:</b> ${App.esc(order.payment)}</div>
        ${order.note ? `<div style="font-size:11px"><b>Obs:</b> ${App.esc(order.note)}</div>` : ''}
        ${isDelivery ? `<div style="font-size:10px;margin-top:6px">📱 Rastreie: ${trackLink}</div>` : ''}`;
    }

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:"Courier New",ui-monospace,Consolas,monospace;width:300px;color:#000;background:#fff;
       font-size:12px;padding:8px; -webkit-print-color-adjust:exact}
  .c{text-align:center}
  table{width:100%;border-collapse:collapse}
  td{padding:1px 0}
  .thick{border-top:1px dashed #000;margin:4px 0}
  .thin{border-top:1px dashed #000;margin:2px 0}
</style></head><body>
  <div class="c">${storeHeader(settings)}</div>
  <table>${orderLines(order)}</table>
  <div class="thick"></div>
  <table>${totals(order)}</table>
  <div class="thin"></div>
  ${extra}
  <div class="thin"></div>
  <div class="c" style="font-size:11px">#${order.number} · ${dateLine}</div>
  <div class="c" style="font-size:10px;margin-top:6px">Obrigado pela preferência!</div>
  <div style="height:40px"></div>
</body></html>`;
  }

  async function printOrder(order, kind) {
    const s = App.data.settings;
    const html = receiptDoc(order, s, kind);
    const copies = (s.printer && s.printer.copies) || 1;
    const deviceName = (s.printer && s.printer.name) || '';
    try {
      if (!window.lv || !window.lv.printHtml) { App.toast('Impressão indisponível fora do Electron'); return false; }
      const r = await window.lv.printHtml({ html, copies, deviceName, silent: true });
      if (!r.ok) App.toast('Erro na impressão: ' + r.error, true);
      return r.ok;
    } catch (e) {
      App.toast('Erro na impressão: ' + e.message, true);
      return false;
    }
  }
  App.printOrder = printOrder;

  function receiptHtml(order) {
    return receiptDoc(order, App.data.settings, 'venda');
  }
  App.receiptHtml = receiptHtml;
})();