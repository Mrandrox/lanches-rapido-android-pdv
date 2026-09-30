'use strict';

/* ============================================================
   Cardápio — categorias e produtos
   ============================================================ */
(function () {
  const App = window.App;
  const st = { cat: null, editing: null };

  function show() {
    if (!st.cat) {
      const c = App.data.categories[0];
      st.cat = c ? c.id : null;
    }
    render();
  }

  function render() {
    const root = document.getElementById('screenContent');
    root.innerHTML = `
      <div class="row-between wrap mb">
        <h3 class="section-title" style="margin:0">Gestão de cardápio</h3>
        <div class="row">
          <button class="btn" onclick="window.__menu.catNew()">＋ Categoria</button>
          <button class="btn btn-primary" onclick="window.__menu.prodNew()">＋ Produto</button>
        </div>
      </div>
      <div class="menu-rail">
        <div class="menu-cats">
          ${App.data.categories.map(c => `
            <div class="cat-item ${c.id === st.cat ? 'active' : ''}" onclick="window.__menu.sel('${c.id}')">
              <span>${App.esc(c.icon)}</span><span style="flex:1">${App.esc(c.name)}</span>
              <span style="color:var(--muted);font-size:11px">${App.data.products.filter(p => p.categoryId === c.id).length}</span>
              <button class="icon-btn" onclick="event.stopPropagation();window.__menu.catEdit('${c.id}')">✏️</button>
            </div>`).join('')}
        </div>
        <div class="menu-prods">
          <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">
            ${productsOfCat().map(p => `
              <div class="card ${p.active === false ? 'inactive' : ''}" style="padding:12px">
                ${p.image ? `<img class="menu-product-image" src="${App.esc(p.image)}" alt="">` : ''}
                <div class="row-between" style="margin-bottom:6px">
                  <b>${App.esc(p.name)} ${p.active === false ? '<span class="badge canceled">inativo</span>' : ''}</b>
                  <span style="color:var(--accent-2);font-weight:800">${App.money(p.price)}</span>
                </div>
                <div class="muted" style="font-size:12px;margin-bottom:8px">${App.esc(p.description || '')}</div>
                <div class="row">
                  <button class="btn btn-ghost btn-sm" onclick="window.__menu.prodEdit('${p.id}')">✏️ Editar</button>
                  <button class="btn btn-ghost btn-sm ${p.active === false ? '' : ''}" onclick="window.__menu.toggle('${p.id}')">${p.active === false ? 'Ativar' : 'Desativar'}</button>
                  <button class="btn btn-danger btn-sm" onclick="window.__menu.del('${p.id}')">🗑️</button>
                </div>
              </div>`).join('')}
            ${productsOfCat().length ? '' : '<div class="empty-state">Categoria vazia.</div>'}
          </div>
        </div>
      </div>`;
  }

  function productsOfCat() {
    return App.data.products.filter(p => p.categoryId === st.cat);
  }

  function prodForm(p) {
    const isEdit = !!p;
    p = p || {};
    return `
      <h3>${isEdit ? 'Editar produto' : 'Novo produto'}</h3>
      <div class="field"><label>Nome *</label><input id="pName" value="${App.esc(p.name || '')}"></div>
      <div class="field"><label>Descrição</label><input id="pDesc" value="${App.esc(p.description || '')}"></div>
      <div class="row">
        <div class="field" style="flex:1"><label>Preço (R$) *</label><input id="pPrice" type="number" step="0.01" min="0" value="${p.price || ''}"></div>
        <div class="field" style="flex:1"><label>Categoria</label>
          <select id="pCat">${App.data.categories.map(c => `<option value="${c.id}" ${c.id === (p.categoryId || st.cat) ? 'selected' : ''}>${App.esc(c.name)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field">
        <label>Imagem do produto</label>
        <div class="row">
          <input id="pImg" style="flex:1" value="${App.esc(p.image || '')}" placeholder="https://… ou selecione um arquivo">
          <button class="btn btn-ghost" type="button" onclick="window.__menu.pickImage()">📷 Escolher</button>
        </div>
        <div id="pImgPreview" class="product-image-preview" ${p.image ? '' : 'style="display:none"'}><img src="${App.esc(p.image || '')}" alt=""></div>
        <p class="muted" style="font-size:11px">Use uma URL ou uma imagem local. A imagem local fica salva no cadastro do produto.</p>
      </div>
      <div class="modal-actions">
        <button class="btn" data-x>Cancelar</button>
        <button class="btn btn-primary" onclick="window.__menu.prodSave('${p.id || ''}')">Salvar</button>
      </div>`;
  }

  function catForm(c) {
    c = c || {};
    return `
      <h3>${c.id ? 'Editar categoria' : 'Nova categoria'}</h3>
      <div class="field"><label>Ícone</label><input id="cIcon" value="${App.esc(c.icon || '🍔')}"></div>
      <div class="field"><label>Nome *</label><input id="cName" value="${App.esc(c.name || '')}" placeholder="Ex.: Lanches"></div>
      <div class="modal-actions">
        <button class="btn" data-x>Cancelar</button>
        <button class="btn btn-primary" onclick="window.__menu.catSave('${c.id || ''}')">Salvar</button>
      </div>`;
  }

  window.__menu = {
    sel(id) { st.cat = id; render(); },
    catNew() { App.modal(catForm()); },
    catEdit(id) { App.modal(catForm(App.data.categories.find(c => c.id === id))); },
    async catSave(id) {
      const name = document.getElementById('cName').value.trim();
      const icon = document.getElementById('cIcon').value.trim() || '🍔';
      if (!name) return App.toast('Informe o nome.', true);
      try {
        if (id) await App.api('/api/categories/' + id, { method: 'PUT', body: { name, icon } });
        else await App.api('/api/categories', { method: 'POST', body: { name, icon } });
        await App.refresh();
        App.closeModal(); render(); App.toast('Categoria salva ✅');
      } catch (e) { App.toast(e.message, true); }
    },
    prodNew() { App.modal(prodForm()); bindImagePreview(); },
    prodEdit(id) { App.modal(prodForm(App.data.products.find(p => p.id === id))); bindImagePreview(); },
    async pickImage() {
      if (!window.lv || !window.lv.pickImage) return App.toast('Seleção de imagem indisponível neste ambiente.', true);
      const dataUrl = await window.lv.pickImage();
      if (!dataUrl) return;
      document.getElementById('pImg').value = dataUrl;
      showImagePreview(dataUrl);
    },
    async prodSave(id) {
      const name = document.getElementById('pName').value.trim();
      const desc = document.getElementById('pDesc').value.trim();
      const price = parseFloat(document.getElementById('pPrice').value) || 0;
      const categoryId = document.getElementById('pCat').value;
      const image = document.getElementById('pImg').value.trim();
      if (!name || price <= 0) return App.toast('Nome e preço são obrigatórios.', true);
      try {
        if (id) await App.api('/api/products/' + id, { method: 'PUT', body: { name, description: desc, price, categoryId, image } });
        else await App.api('/api/products', { method: 'POST', body: { name, description: desc, price, categoryId, image } });
        await App.refresh();
        App.closeModal(); render(); App.toast('Produto salvo ✅');
      } catch (e) { App.toast(e.message, true); }
    },
    async toggle(id) {
      const p = App.data.products.find(x => x.id === id);
      if (!p) return;
      try {
        await App.api('/api/products/' + id, { method: 'PUT', body: { active: p.active === false } });
        await App.refresh(); render();
      } catch (e) { App.toast(e.message, true); }
    },
    async del(id) {
      if (!confirm('Excluir este produto?')) return;
      try {
        await App.api('/api/products/' + id, { method: 'DELETE' });
        await App.refresh(); render(); App.toast('Produto excluído.');
      } catch (e) { App.toast(e.message, true); }
    },
  };

  function showImagePreview(url) {
    const preview = document.getElementById('pImgPreview');
    if (!preview) return;
    preview.querySelector('img').src = url;
    preview.style.display = url ? '' : 'none';
  }

  function bindImagePreview() {
    const input = document.getElementById('pImg');
    if (input) input.addEventListener('input', () => showImagePreview(input.value.trim()));
  }

  App.registerScreen({ id: 'menu', label: 'Cardápio', icon: '🍔', roles: ['admin', 'operator'], show });
})();