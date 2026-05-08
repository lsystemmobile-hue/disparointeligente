const Campaigns = {
  variantCount: 1,
  meta: { tags: [], groups: [], tagCounts: {}, groupCounts: {}, total: 0 },
  contactMode: 'all',

  async renderNew() {
    setContent('<div class="loading-spinner-wrap"><div class="spinner"></div></div>');
    try {
      this.meta = await API.get('/api/contacts/meta');
      this.variantCount = 1;
      this.contactMode = 'all';
    } catch(e) {}
    setContent(this.buildForm());
    this.bindEvents();
    this.fetchAvailableFields();
  },

  loadCadenceFromStorage() {
    try { return JSON.parse(localStorage.getItem('cadence_config') || '{}'); } catch { return {}; }
  },

  saveCadenceToStorage() {
    const config = {};
    ['minInterval', 'maxInterval', 'batchSize', 'batchPause'].forEach(k => {
      config[k] = document.getElementById(`cad-${k}`)?.value || '';
    });
    localStorage.setItem('cadence_config', JSON.stringify(config));
  },

  buildForm() {
    const tagOptions = this.meta.tags.map(t =>
      `<option value="${escHtml(t)}">${escHtml(t)} (${this.meta.tagCounts?.[t] || 0})</option>`
    ).join('');
    const groupOptions = this.meta.groups.map(g =>
      `<option value="${escHtml(g)}">${escHtml(g)} (${this.meta.groupCounts?.[g] || 0})</option>`
    ).join('');
    const cad = this.loadCadenceFromStorage();

    return `
      <div class="page-header">
        <h1>Nova Campanha</h1>
      </div>

      ${this.meta.total === 0 ? `
        <div class="alert alert-warning">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>
          Você ainda não tem contatos. <a href="#/contatos" style="color:inherit;font-weight:600;">Importe contatos</a> antes de criar uma campanha.
        </div>
      ` : ''}

      <form id="campaign-form" onsubmit="Campaigns.submit(event)">

        <!-- SECTION 1: NOME -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><h2>1. Identificação</h2></div>
          <div class="form-group">
            <label>Nome da campanha *</label>
            <input type="text" id="camp-name" required placeholder="Ex: Promoção Janeiro 2025">
          </div>
        </div>

        <!-- SECTION 2: CONTATOS -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><h2>2. Contatos</h2></div>

          <div class="contact-selection-tabs">
            <div class="selection-option active" onclick="Campaigns.setContactMode('all', this)">
              Todos os contatos (${this.meta.total})
            </div>
            ${this.meta.tags.length > 0 ? `<div class="selection-option" onclick="Campaigns.setContactMode('tag', this)">Por Tag</div>` : ''}
            ${this.meta.groups.length > 0 ? `<div class="selection-option" onclick="Campaigns.setContactMode('group', this)">Por Grupo</div>` : ''}
          </div>

          <div id="contact-mode-extra" style="display:none;">
            <div class="form-group">
              <label id="contact-mode-label">Tag</label>
              <select id="contact-mode-value" onchange="Campaigns.onContactValueChange()">
                <optgroup label="Tags">${tagOptions}</optgroup>
                <optgroup label="Grupos">${groupOptions}</optgroup>
              </select>
            </div>
          </div>

          <div id="contact-count-info" class="form-hint" style="margin-top:8px; font-size:13px;">
            <strong>${this.meta.total}</strong> contatos selecionados
          </div>
        </div>

        <!-- SECTION 3: MENSAGENS -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header">
            <h2>3. Mensagens</h2>
            <button type="button" class="btn btn-secondary btn-sm" onclick="Campaigns.addVariant()">+ Adicionar variação</button>
          </div>

          <div class="alert alert-info" style="margin-bottom:16px;" id="vars-info">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Variáveis disponíveis: <code>{{nome}}</code> <code>{{telefone}}</code> <code>{{cidade}}</code>
            — O sistema sorteia uma mensagem diferente para cada contato.
          </div>

          <div class="variant-list" id="variant-list">
            <div class="variant-item" data-idx="0">
              <div class="variant-number">1</div>
              <textarea name="variant" required placeholder="Olá {{nome}}, tudo bem? Estamos com uma promoção especial para você!&#10;&#10;Caso não queira mais receber mensagens, responda SAIR."></textarea>
            </div>
          </div>
        </div>

        <!-- SECTION 4: CADÊNCIA -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header"><h2>4. Cadência e Controle</h2></div>

          <div class="form-row">
            <div class="form-group">
              <label>Intervalo mínimo entre envios (segundos)</label>
              <input type="number" id="cad-minInterval" value="${cad.minInterval || 20}" min="5" max="3600">
            </div>
            <div class="form-group">
              <label>Intervalo máximo entre envios (segundos)</label>
              <input type="number" id="cad-maxInterval" value="${cad.maxInterval || 60}" min="5" max="3600">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Mensagens por lote</label>
              <input type="number" id="cad-batchSize" value="${cad.batchSize || 10}" min="1" max="500">
            </div>
            <div class="form-group">
              <label>Pausa entre lotes (segundos)</label>
              <input type="number" id="cad-batchPause" value="${cad.batchPause || 300}" min="30" max="86400">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Limite máximo de envios (0 = sem limite)</label>
              <input type="number" id="cad-maxSends" value="0" min="0">
            </div>
            <div class="form-group">
              <!-- empty -->
            </div>
          </div>

          <div id="cadence-preview" class="alert alert-success" style="margin-top:4px;font-size:12.5px;"></div>
        </div>

        <!-- SECTION 5: AVISO -->
        <div class="alert alert-warning" style="margin-bottom:16px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>
          <div>
            Envie mensagens <strong>apenas para contatos que autorizaram</strong> o recebimento.
            Recomendamos incluir em suas mensagens: <em>"Caso não queira mais receber mensagens, responda SAIR."</em>
          </div>
        </div>

        <div style="display:flex; gap:12px;">
          <button type="submit" class="btn btn-primary btn-lg">Criar Campanha</button>
          <a href="#/historico" class="btn btn-secondary btn-lg">Cancelar</a>
        </div>

      </form>
    `;
  },

  bindEvents() {
    ['cad-minInterval', 'cad-maxInterval', 'cad-batchSize', 'cad-batchPause'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        this.updateCadencePreview();
        this.saveCadenceToStorage();
      });
    });
    this.updateCadencePreview();
  },

  setContactMode(mode, el) {
    this.contactMode = mode;
    document.querySelectorAll('.selection-option').forEach(o => o.classList.remove('active'));
    el.classList.add('active');

    const extra = document.getElementById('contact-mode-extra');
    const label = document.getElementById('contact-mode-label');
    const select = document.getElementById('contact-mode-value');
    const info = document.getElementById('contact-count-info');

    if (mode === 'all') {
      extra.style.display = 'none';
      if (info) info.innerHTML = `<strong>${this.meta.total}</strong> contatos selecionados`;
      this.fetchAvailableFields();
    } else if (mode === 'tag') {
      extra.style.display = 'block';
      if (label) label.textContent = 'Selecione a tag:';
      if (select) {
        const tagOptions = this.meta.tags.map(t =>
          `<option value="${escHtml(t)}">${escHtml(t)} (${this.meta.tagCounts?.[t] || 0})</option>`
        ).join('');
        select.innerHTML = tagOptions;
        select.onchange = () => this.onContactValueChange();
      }
      this.onContactValueChange();
    } else if (mode === 'group') {
      extra.style.display = 'block';
      if (label) label.textContent = 'Selecione o grupo:';
      if (select) {
        const groupOptions = this.meta.groups.map(g =>
          `<option value="${escHtml(g)}">${escHtml(g)} (${this.meta.groupCounts?.[g] || 0})</option>`
        ).join('');
        select.innerHTML = groupOptions;
        select.onchange = () => this.onContactValueChange();
      }
      this.onContactValueChange();
    }
  },

  onContactValueChange() {
    const select = document.getElementById('contact-mode-value');
    const info = document.getElementById('contact-count-info');
    const val = select?.value || '';
    if (this.contactMode === 'tag') {
      const count = this.meta.tagCounts?.[val] ?? '?';
      if (info) info.innerHTML = `<strong>${count}</strong> contatos nesta tag`;
    } else if (this.contactMode === 'group') {
      const count = this.meta.groupCounts?.[val] ?? '?';
      if (info) info.innerHTML = `<strong>${count}</strong> contatos neste grupo`;
    }
    this.fetchAvailableFields();
  },

  async fetchAvailableFields() {
    const params = new URLSearchParams();
    if (this.contactMode === 'tag') {
      const val = document.getElementById('contact-mode-value')?.value;
      if (val) params.set('tag', val);
    } else if (this.contactMode === 'group') {
      const val = document.getElementById('contact-mode-value')?.value;
      if (val) params.set('group', val);
    }
    try {
      const extraFields = await API.get(`/api/contacts/fields?${params}`);
      this.updateVariablesDisplay(extraFields);
    } catch {}
  },

  updateVariablesDisplay(extraFields) {
    const el = document.getElementById('vars-info');
    if (!el) return;
    const standard = ['nome', 'telefone', 'cidade'];
    const all = [...standard, ...extraFields.filter(f => !standard.includes(f))];
    el.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Variáveis disponíveis: ${all.map(f => `<code>{{${escHtml(f)}}}</code>`).join(' ')}
      — O sistema sorteia uma mensagem diferente para cada contato.
    `;
  },

  addVariant() {
    this.variantCount++;
    const list = document.getElementById('variant-list');
    if (!list) return;
    const div = document.createElement('div');
    div.className = 'variant-item';
    div.dataset.idx = this.variantCount - 1;
    div.innerHTML = `
      <div class="variant-number">${this.variantCount}</div>
      <textarea name="variant" required placeholder="Variação ${this.variantCount}..."></textarea>
      <button type="button" class="btn-icon danger" onclick="Campaigns.removeVariant(this)" style="margin-top:9px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`;
    list.appendChild(div);
  },

  removeVariant(btn) {
    const item = btn.closest('.variant-item');
    if (!item) return;
    const list = document.getElementById('variant-list');
    if (list && list.children.length <= 1) { toast('É necessário ao menos uma mensagem', 'warning'); return; }
    item.remove();
    this.renumberVariants();
  },

  renumberVariants() {
    document.querySelectorAll('.variant-item').forEach((item, i) => {
      const num = item.querySelector('.variant-number');
      if (num) num.textContent = i + 1;
    });
    this.variantCount = document.querySelectorAll('.variant-item').length;
  },

  updateCadencePreview() {
    const min = parseInt(document.getElementById('cad-minInterval')?.value) || 20;
    const max = parseInt(document.getElementById('cad-maxInterval')?.value) || 60;
    const batch = parseInt(document.getElementById('cad-batchSize')?.value) || 10;
    const pause = parseInt(document.getElementById('cad-batchPause')?.value) || 300;
    const el = document.getElementById('cadence-preview');
    if (el) {
      el.innerHTML = `Envia ${batch} mensagens com ${min}–${max}s de intervalo, depois pausa ${pause}s (${Math.round(pause/60)}min). Média: ${Math.round((min+max)/2)}s por mensagem.`;
    }
  },

  getContactCount() {
    if (this.contactMode === 'all') return this.meta.total;
    const val = document.getElementById('contact-mode-value')?.value || '';
    if (this.contactMode === 'tag') return this.meta.tagCounts?.[val] ?? 0;
    if (this.contactMode === 'group') return this.meta.groupCounts?.[val] ?? 0;
    return 0;
  },

  collectFormData() {
    const name = document.getElementById('camp-name')?.value?.trim();
    if (!name) { toast('Informe o nome da campanha', 'warning'); return null; }

    const variants = [...document.querySelectorAll('[name="variant"]')]
      .map(el => el.value.trim())
      .filter(v => v.length > 0);
    if (variants.length === 0) { toast('Adicione ao menos uma mensagem', 'warning'); return null; }

    const cadence_config = {
      minInterval: parseInt(document.getElementById('cad-minInterval')?.value) || 20,
      maxInterval: parseInt(document.getElementById('cad-maxInterval')?.value) || 60,
      batchSize: parseInt(document.getElementById('cad-batchSize')?.value) || 10,
      batchPause: parseInt(document.getElementById('cad-batchPause')?.value) || 300,
      maxSends: parseInt(document.getElementById('cad-maxSends')?.value) || 0,
    };

    const contact_filter = {};
    if (this.contactMode === 'all') {
      contact_filter.all = true;
    } else if (this.contactMode === 'tag') {
      contact_filter.tag = document.getElementById('contact-mode-value')?.value || '';
    } else if (this.contactMode === 'group') {
      contact_filter.group = document.getElementById('contact-mode-value')?.value || '';
    }

    return { name, variants, cadence_config, contact_filter };
  },

  submit(event) {
    event.preventDefault();
    const formData = this.collectFormData();
    if (!formData) return;
    const count = this.getContactCount();
    if (count === 0) { toast('Nenhum contato selecionado', 'warning'); return; }
    this.showConfirmModal(formData, count);
  },

  showConfirmModal(formData, count) {
    const { name, variants, cadence_config: cad, contact_filter } = formData;
    const eta = fmtEta(count, cad);

    let filterDesc = 'Todos os contatos';
    if (contact_filter.tag) filterDesc = `Tag: ${contact_filter.tag}`;
    if (contact_filter.group) filterDesc = `Grupo: ${contact_filter.group}`;

    const variantsHtml = variants.map((v, i) => `
      <div style="margin-bottom:10px;">
        <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Variação ${i + 1}</div>
        <div style="background:var(--bg);border-radius:var(--radius-sm);padding:10px 12px;font-size:13px;line-height:1.5;border:1px solid var(--border);white-space:pre-wrap;max-height:80px;overflow:hidden;">${escHtml(v.slice(0, 180))}${v.length > 180 ? '…' : ''}</div>
      </div>
    `).join('');

    Modal.open(`
      <div class="modal-header">
        <h2>Confirmar Campanha</h2>
        <button class="btn-icon" onclick="Modal.close()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body" style="max-height:65vh;overflow-y:auto;">
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;border:1px solid var(--border);">
              <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Campanha</div>
              <div style="font-weight:600;">${escHtml(name)}</div>
            </div>
            <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;border:1px solid var(--border);">
              <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Destinatários</div>
              <div style="font-weight:600;">${count.toLocaleString()} contatos</div>
              <div style="font-size:12px;color:var(--text-muted);">${escHtml(filterDesc)}</div>
            </div>
            <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;border:1px solid var(--border);">
              <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Cadência</div>
              <div style="font-size:12.5px;line-height:1.7;">
                ${cad.minInterval}–${cad.maxInterval}s entre envios<br>
                Lote de ${cad.batchSize} → pausa ${cad.batchPause}s<br>
                ${cad.maxSends > 0 ? `Limite: ${cad.maxSends} envios` : 'Sem limite'}
              </div>
            </div>
            <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px;border:1px solid var(--border);">
              <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Tempo estimado</div>
              <div style="font-weight:600;font-size:18px;">${eta}</div>
            </div>
          </div>

          <div>
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${variants.length} variação(ões) de mensagem</div>
            ${variantsHtml}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modal.close()">Revisar</button>
        <button class="btn btn-primary" id="modal-confirm-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Confirmar e Criar
        </button>
      </div>
    `);

    document.getElementById('modal-confirm-btn').onclick = () => {
      Modal.close();
      this.createCampaign(formData);
    };
  },

  async createCampaign(formData) {
    const submitBtn = document.querySelector('#campaign-form [type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Criando...'; }

    try {
      const result = await API.post('/api/campaigns', {
        name: formData.name,
        message_variants: formData.variants,
        cadence_config: formData.cadence_config,
        contact_filter: formData.contact_filter
      });

      if (result.error) {
        toast(result.error, 'error');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Criar Campanha'; }
        return;
      }

      toast('Campanha criada com sucesso!');
      window.location.hash = `#/campanhas/${result.id}/executar`;
    } catch(e) {
      toast('Erro ao criar campanha: ' + e.message, 'error');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Criar Campanha'; }
    }
  }
};
