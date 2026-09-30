(() => {
  const $ = (s) => document.querySelector(s);
  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    document.body.innerHTML = '<div class="empty" style="padding-top:40vh">Pedido não informado.</div>';
    return;
  }

  const STEPS = [
    ['novo', 'Recebido', 'Pedido entrou na fila'],
    ['preparando', 'Preparando', 'Separando e gelando suas bebidas'],
    ['pronto', 'Pronto', 'Embalado e aguardando'],
    ['rota', 'Saiu para entrega', 'Motoboy a caminho'],
    ['entregue', 'Entregue', 'Aproveite!'],
  ];

  function money(v) { return 'R$ ' + v.toFixed(2).replace('.', ','); }

  function render(o) {
    $('#code').textContent = 'Pedido ' + o.code;
    const cancel = o.status === 'cancelado';
    if (cancel) {
      $('#status').textContent = o.statusLabel;
      $('#status').style.background = 'var(--danger)';
    } else {
      $('#status').textContent = o.statusLabel;
      $('#status').style.background = '';
    }
    $('#eta').textContent = cancel ? 'Pedido cancelado pelo estabelecimento.' : (o.eta ? `Previsão de chegada: ${o.eta}` : 'Status em tempo real.');

    const done = o.status === 'entregue' || o.status === 'retirado';
    const tl = $('#timeline');
    tl.innerHTML = '';
    STEPS.forEach(([key, label, desc], i) => {
      const step = document.createElement('div');
      step.className = 'step' + (done || ['entregue', 'rota', 'pronto', 'preparando'].indexOf(o.status) > i ? ' done' : '') + (o.status === key ? ' active' : '');
      step.innerHTML = `<div class="dot">${done && i === STEPS.length - 1 && o.status === 'entregue' ? '✓' : ''}</div>
        <div class="info"><b>${label}</b><small>${desc}</small></div>`;
      tl.appendChild(step);
    });

    const d = $('#details');
    d.innerHTML = `
      <h4 style="margin-top:0">Itens do pedido</h4>
      ${o.items.map(i => `<div class="li"><span>${i.qty}× ${i.name} <small class="muted">(${i.size})</small></span><span>${money(i.price * i.qty)}</span></div>`).join('')}
      <div class="li"><span class="muted">Entrega</span><span>${o.totals.delivery === 0 ? 'Retirada no balcão' : money(o.totals.delivery)}</span></div>
      <div class="li"><b>Total</b><b>${money(o.totals.grand)}</b></div>
      <p class="muted" style="font-size:13px;margin:12px 0 0">Pagamento na entrega/balcão.</p>`;
  }

  fetch(`/api/orders/${id}`).then(r => r.json()).then(o => {
    render(o);
    const ev = new EventSource(`/api/orders/${id}/events`);
    ev.onmessage = (e) => render(JSON.parse(e.data));
    ev.onerror = () => { /* reconecta automaticamente */ };
  }).catch(() => {
    document.body.innerHTML = '<div class="empty" style="padding-top:40vh">Pedido não encontrado.</div>';
  });
})();