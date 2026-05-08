const Contacts = {
  previewData: { valid: [], invalid: [] },
  currentMeta: { tags: [], groups: [], tagCounts: {}, groupCounts: {}, total: 0 },

  async render() {
    setContent('<div class="loading-spinner-wrap"><div class="spinner"></div></div>');
    try {
      const [contacts, meta] = await Promise.all([
        API.get('/api/contacts'),
        API.get('/api/contacts/meta')
      ]);
      this.currentMeta = meta;
      setContent(this.buildHTML(contacts, meta));
    } catch (e) {
      setContent('<div class="alert alert-danger">Erro ao carregar contatos.</div>');
    }
  },

  buildHTML(contacts, meta) {
    const tagOptions = meta.tags.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('');
    const groupOptions = meta.groups.map(g => `<option value="${escHtml(g)}">${escHtml(g)}</option>`).join('');

    return `
      <div class="page-header">
        <h1>Contatos <span style="font-size:16px;font-weight:400;color:var(--text-muted);">(${meta.total.toLocaleString()})</span></h1>
        <div class="page-header-actions">
          <button class="btn btn-primary" onclick="Contacts.showImportModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Importar Contatos
          </button>
        </div>
      </div>

      <div class="filter-bar">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-muted);">
          <input type="checkbox" id="select-all-cb" onchange="Contacts.toggleAll(this)">
          Todos
        </label>
        <input type="text" id="contact-search" placeholder="Buscar por nome, telefone ou cidade..." oninput="Contacts.search()" style="max-width:280px;">
        <select id="contact-tag-filter" onchange="Contacts.search()">
          <option value="">Todas as tags</option>
          ${tagOptions}
        </select>
        <select id="contact-group-filter" onchange="Contacts.search()">
          <option value="">Todos os grupos</option>
          ${groupOptions}
        </select>
        <button id="assign-group-btn" class="btn btn-secondary btn-sm" onclick="Contacts.showAssignGroupModal()" style="display:none;">
          Atribuir grupo
        </button>
        <button id="bulk-delete-btn" class="btn btn-danger btn-sm" onclick="Contacts.deleteSelected()" style="display:none;">
          Excluir selecionados
        </button>
      </div>

      <div id="contacts-container">
        ${this.buildGroupedCards(contacts)}
      </div>
    `;
  },

  buildGroupedCards(contacts) {
    if (contacts.length === 0) {
      return `
        <div class="card">
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            <h3>Nenhum contato encontrado</h3>
            <p>Importe um CSV, XLSX ou cole os números manualmente</p>
            <button class="btn btn-primary" onclick="Contacts.showImportModal()">Importar Contatos</button>
          </div>
        </div>`;
    }

    const groups = {};
    const ungrouped = [];
    for (const c of contacts) {
      const g = c.group_name || '';
      if (g) {
        if (!groups[g]) groups[g] = [];
        groups[g].push(c);
      } else {
        ungrouped.push(c);
      }
    }

    let html = '';
    const sortedGroups = Object.keys(groups).sort();
    sortedGroups.forEach((gname, idx) => {
      html += this.buildGroupCard(gname, groups[gname], idx);
    });
    if (ungrouped.length > 0) {
      html += this.buildGroupCard('', ungrouped, sortedGroups.length);
    }
    return html;
  },

  buildGroupCard(groupName, contacts, idx) {
    const title = groupName || 'Sem grupo';
    const rows = contacts.map(c => this.buildContactRow(c)).join('');
    return `
      <div class="card" style="margin-bottom:12px;" id="group-card-${idx}">
        <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding-bottom:${contacts.length > 0 ? '14px' : '0'};margin-bottom:${contacts.length > 0 ? '4px' : '0'};border-bottom:${contacts.length > 0 ? '1px solid var(--border)' : 'none'};" onclick="Contacts.toggleGroupCard(${idx})">
          <h2 style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;">
            <svg id="gc-icon-${idx}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transition:transform 0.2s;"><polyline points="6 9 12 15 18 9"/></svg>
            ${groupName
              ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>`
              : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`
            }
            ${escHtml(title)}
            <span class="badge ${groupName ? 'badge-blue' : 'badge-gray'}" style="font-size:11px;font-weight:500;">${contacts.length}</span>
          </h2>
        </div>
        <div id="gc-body-${idx}">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style="width:36px;"><input type="checkbox" onchange="Contacts.toggleGroupAll(this,${idx})" title="Selecionar grupo"></th>
                  <th>Nome</th><th>Telefone</th><th>Cidade</th><th>Tag</th><th>Adicionado em</th><th></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  buildContactRow(c) {
    return `
      <tr>
        <td><input type="checkbox" class="contact-cb" value="${c.id}" onchange="Contacts.updateBulkBtn()"></td>
        <td>${escHtml(c.name || '—')}</td>
        <td style="font-family:monospace;font-size:12.5px;">${escHtml(c.phone)}</td>
        <td>${escHtml(c.city || '—')}</td>
        <td>${c.tag ? `<span class="badge badge-blue">${escHtml(c.tag)}</span>` : '—'}</td>
        <td style="white-space:nowrap;">${fmtDate(c.created_at)}</td>
        <td>
          <button class="btn-icon danger" onclick="Contacts.deleteOne(${c.id})" title="Excluir">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
        </td>
      </tr>`;
  },

  async search() {
    const search = document.getElementById('contact-search')?.value || '';
    const tag = document.getElementById('contact-tag-filter')?.value || '';
    const group = document.getElementById('contact-group-filter')?.value || '';
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (tag) params.set('tag', tag);
    if (group) params.set('group', group);
    try {
      const contacts = await API.get(`/api/contacts?${params}`);
      const container = document.getElementById('contacts-container');
      if (container) container.innerHTML = this.buildGroupedCards(contacts);
    } catch(e) {}
  },

  toggleGroupCard(idx) {
    const body = document.getElementById(`gc-body-${idx}`);
    const icon = document.getElementById(`gc-icon-${idx}`);
    if (!body) return;
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? '' : 'none';
    if (icon) icon.style.transform = isHidden ? '' : 'rotate(-90deg)';
  },

  toggleGroupAll(cb, idx) {
    const card = document.getElementById(`group-card-${idx}`);
    if (!card) return;
    card.querySelectorAll('.contact-cb').forEach(el => el.checked = cb.checked);
    this.updateBulkBtn();
  },

  toggleAll(cb) {
    document.querySelectorAll('.contact-cb').forEach(el => el.checked = cb.checked);
    this.updateBulkBtn();
  },

  updateBulkBtn() {
    const checked = document.querySelectorAll('.contact-cb:checked').length;
    const deleteBtn = document.getElementById('bulk-delete-btn');
    const groupBtn = document.getElementById('assign-group-btn');
    if (deleteBtn) {
      deleteBtn.style.display = checked > 0 ? 'inline-flex' : 'none';
      if (checked > 0) deleteBtn.textContent = `Excluir ${checked} selecionado(s)`;
    }
    if (groupBtn) groupBtn.style.display = checked > 0 ? 'inline-flex' : 'none';
  },

  deleteOne(id) {
    Modal.confirm({
      title: 'Excluir contato',
      message: 'Excluir este contato? Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
    }, async () => {
      try {
        await API.del(`/api/contacts/${id}`);
        toast('Contato excluído');
        this.render();
      } catch(e) { toast('Erro ao excluir contato', 'error'); }
    });
  },

  deleteSelected() {
    const ids = [...document.querySelectorAll('.contact-cb:checked')].map(el => parseInt(el.value));
    if (ids.length === 0) return;
    Modal.confirm({
      title: 'Excluir contatos',
      message: `Excluir ${ids.length} contato(s) selecionado(s)? Esta ação não pode ser desfeita.`,
      confirmText: `Excluir ${ids.length}`,
    }, async () => {
      try {
        await API.del('/api/contacts', { ids });
        toast(`${ids.length} contato(s) excluído(s)`);
        this.render();
      } catch(e) { toast('Erro ao excluir contatos', 'error'); }
    });
  },

  showAssignGroupModal() {
    const ids = [...document.querySelectorAll('.contact-cb:checked')].map(el => parseInt(el.value));
    if (ids.length === 0) return;
    const existingGroups = Object.keys(this.currentMeta?.groupCounts || {});
    const datalistOptions = existingGroups.map(g => `<option value="${escHtml(g)}">`).join('');
    Modal.open(`
      <div class="modal-header">
        <h2>Atribuir Grupo</h2>
        <button class="btn-icon" onclick="Modal.close()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">${ids.length} contato(s) selecionado(s)</p>
        <div class="form-group">
          <label>Nome do grupo</label>
          <input type="text" id="assign-group-input" list="existing-groups-list"
            placeholder="Digite um nome novo ou selecione um existente"
            style="width:100%;">
          <datalist id="existing-groups-list">${datalistOptions}</datalist>
          <div class="form-hint">Deixe em branco para remover do grupo atual.</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
        <button class="btn btn-primary" onclick="Contacts.assignGroup([${ids.join(',')}])">Atribuir</button>
      </div>
    `);
    setTimeout(() => document.getElementById('assign-group-input')?.focus(), 50);
  },

  async assignGroup(ids) {
    const name = document.getElementById('assign-group-input')?.value?.trim() || '';
    Modal.close();
    try {
      await API.patch('/api/contacts/group', { ids, group_name: name });
      toast(name
        ? `${ids.length} contato(s) atribuído(s) ao grupo "${name}"`
        : `${ids.length} contato(s) removido(s) do grupo`
      );
      this.render();
    } catch(e) { toast('Erro ao atribuir grupo', 'error'); }
  },

  showImportModal() {
    this.previewData = { valid: [], invalid: [] };
    const existingGroups = Object.keys(this.currentMeta?.groupCounts || {});
    const groupDatalist = existingGroups.map(g => `<option value="${escHtml(g)}">`).join('');

    Modal.open(`
      <div class="modal-header">
        <h2>Importar Contatos</h2>
        <button class="btn-icon" onclick="Modal.close()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">

        <div class="tabs">
          <button class="tab-btn active" onclick="Contacts.switchTab('file', this)">Arquivo CSV / XLSX</button>
          <button class="tab-btn" onclick="Contacts.switchTab('paste', this)">Colar Números</button>
        </div>

        <!-- FILE TAB -->
        <div id="tab-file" class="tab-panel active">
          <div class="drop-zone" id="drop-zone" onclick="document.getElementById('file-input').click()"
               ondragover="event.preventDefault();this.classList.add('drag-over')"
               ondragleave="this.classList.remove('drag-over')"
               ondrop="Contacts.handleDrop(event)">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <p>Arraste o arquivo aqui ou clique para selecionar</p>
            <small>CSV ou XLSX · Máx. 10MB</small>
          </div>
          <input type="file" id="file-input" accept=".csv,.xlsx,.xls" style="display:none" onchange="Contacts.handleFile(this.files[0])">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-top:10px;flex-wrap:wrap;gap:8px;">
            <div class="form-hint" style="margin:0;">
              Colunas padrão: <code>nome</code>, <code>telefone</code>, <code>cidade</code>, <code>tag</code>, <code>grupo</code>.<br>
              Colunas extras viram variáveis nas mensagens (ex: <code>{{produto}}</code>).
            </div>
            <a href="/api/contacts/template" download class="btn btn-secondary btn-sm" style="flex-shrink:0;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Baixar modelo
            </a>
          </div>
        </div>

        <!-- PASTE TAB -->
        <div id="tab-paste" class="tab-panel">
          <div class="form-group">
            <label>Cole os números abaixo, um por linha:</label>
            <textarea id="paste-area" rows="8" placeholder="11999887766&#10;21988776655&#10;31977665544&#10;&#10;Ou com nome separado por ponto e vírgula:&#10;João Silva; 11999887766; São Paulo"></textarea>
            <div class="form-hint">Formatos aceitos: só número | Nome; Número | Nome; Número; Cidade | Nome; Número; Cidade; Tag</div>
          </div>
          <button class="btn btn-secondary" onclick="Contacts.processPaste()">Validar Números</button>
        </div>

        <!-- EXTRA FIELDS (tag) -->
        <div id="extra-fields-notice"></div>
        <div id="extra-fields" style="display:none; margin-top:16px;">
          <div class="form-group" style="margin-bottom:0">
            <label>Tag (opcional)</label>
            <input type="text" id="import-tag" placeholder="Ex: cliente, lead...">
          </div>
        </div>

        <!-- PREVIEW -->
        <div id="import-preview" style="margin-top: 16px;"></div>
      </div>

      <!-- RODAPÉ com campo de grupo sempre visível -->
      <div class="modal-footer" style="flex-wrap:wrap;gap:8px;align-items:center;">
        <div style="flex:1;min-width:180px;display:flex;align-items:center;gap:6px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" style="flex-shrink:0;"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          <input type="text" id="import-group-top" list="import-groups-dl" autocomplete="off"
            placeholder="Nome do grupo (obrigatório)"
            style="flex:1;min-width:0;border-color:var(--accent);"
            title="Informe o grupo ao qual os contatos serão adicionados">
          <datalist id="import-groups-dl">${groupDatalist}</datalist>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
          <button class="btn btn-primary" id="save-contacts-btn" onclick="Contacts.saveImport()" style="display:none">Salvar Contatos</button>
        </div>
      </div>
    `);
  },

  switchTab(tab, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    document.getElementById('import-preview').innerHTML = '';
    document.getElementById('save-contacts-btn').style.display = 'none';
    this.previewData = { valid: [], invalid: [] };
  },

  handleDrop(e) {
    e.preventDefault();
    document.getElementById('drop-zone')?.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) this.handleFile(file);
  },

  async handleFile(file) {
    if (!file) return;
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) dropZone.innerHTML = '<div class="spinner" style="width:24px;height:24px;border-width:2px;margin:0 auto;"></div>';
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await API.upload('/api/contacts/import', formData);
      if (result.error) { toast(result.error, 'error'); this.resetDropZone(); return; }
      if (result.contacts && result.contacts.length > 0) {
        document.getElementById('extra-fields').style.display = 'block';
        if (result.extraFields?.length > 0) {
          const extraNotice = document.getElementById('extra-fields-notice');
          if (extraNotice) {
            extraNotice.innerHTML = `
              <div class="alert alert-info" style="margin-top:8px;font-size:12.5px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Colunas extras detectadas — disponíveis como variáveis nas mensagens:
                ${result.extraFields.map(f => `<code>{{${escHtml(f)}}}</code>`).join(' ')}
              </div>`;
          }
        }
        await this.previewContacts(result.contacts);
      } else {
        toast('Nenhum contato encontrado. Verifique se o arquivo tem cabeçalho e coluna de telefone.', 'warning');
        this.resetDropZone();
      }
    } catch(e) {
      toast('Erro ao processar arquivo: ' + e.message, 'error');
      this.resetDropZone();
    }
  },

  resetDropZone() {
    const dz = document.getElementById('drop-zone');
    if (dz) dz.innerHTML = `
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <p>Arraste o arquivo aqui ou clique para selecionar</p>
      <small>CSV ou XLSX · Máx. 10MB</small>`;
  },

  processPaste() {
    const text = document.getElementById('paste-area')?.value || '';
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const contacts = lines.map(line => {
      const parts = line.split(/[;,\t]/).map(p => p.trim());
      if (parts.length >= 2) {
        return { name: parts[0], phone: parts[1], city: parts[2] || '', tag: parts[3] || '', group_name: parts[4] || '' };
      }
      return { name: '', phone: parts[0], city: '', tag: '', group_name: '' };
    });
    this.previewContacts(contacts);
  },

  async previewContacts(contacts) {
    try {
      const result = await API.post('/api/contacts/preview', { contacts });
      this.previewData = result;
      this.renderPreview(result);
    } catch(e) {
      toast('Erro ao validar contatos', 'error');
    }
  },

  renderPreview(result) {
    const { valid, invalid } = result;
    const saveBtn = document.getElementById('save-contacts-btn');
    if (saveBtn) {
      saveBtn.style.display = valid.length > 0 ? 'inline-flex' : 'none';
      saveBtn.textContent = `Salvar ${valid.length} contato(s) válido(s)`;
    }

    const previewEl = document.getElementById('import-preview');
    if (!previewEl) return;

    let html = '';

    if (valid.length > 0) {
      html += `
        <div class="preview-section">
          <h3><span class="badge badge-green">${valid.length} válidos</span></h3>
          <div class="table-wrap" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
            <table>
              <thead><tr><th>Nome</th><th>Telefone</th><th>Cidade</th></tr></thead>
              <tbody>
                ${valid.slice(0, 50).map(c => `
                  <tr>
                    <td>${escHtml(c.name || '—')}</td>
                    <td style="font-family:monospace;">${escHtml(c.phone)}</td>
                    <td>${escHtml(c.city || '—')}</td>
                  </tr>
                `).join('')}
                ${valid.length > 50 ? `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);">...e mais ${valid.length - 50} contatos</td></tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>`;
    }

    if (invalid.length > 0) {
      html += `
        <div class="preview-section" style="margin-top:12px;">
          <h3><span class="badge badge-red">${invalid.length} inválidos</span> <span style="font-size:12px;color:var(--text-muted);font-weight:400;">(serão ignorados)</span></h3>
          <div class="table-wrap" style="max-height:130px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
            <table>
              <thead><tr><th>Número informado</th><th>Motivo</th></tr></thead>
              <tbody>
                ${invalid.slice(0, 20).map(c => `
                  <tr><td style="font-family:monospace;">${escHtml(c.phone)}</td><td>${escHtml(c.reason)}</td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    }

    if (valid.length === 0 && invalid.length === 0) {
      html = '<div class="alert alert-warning">Nenhum número encontrado. Verifique o formato do arquivo.</div>';
    }

    previewEl.innerHTML = html;
  },

  async saveImport() {
    const { valid } = this.previewData;
    if (valid.length === 0) return;

    const groupInput = document.getElementById('import-group-top');
    const groupTop = groupInput?.value?.trim() || '';
    if (!groupTop) {
      groupInput?.focus();
      groupInput?.style && (groupInput.style.borderColor = 'var(--danger)');
      toast('Informe o nome do grupo antes de salvar.', 'error');
      return;
    }
    if (groupInput) groupInput.style.borderColor = '';

    const tag = document.getElementById('import-tag')?.value?.trim() || '';

    const contacts = valid.map(c => ({
      name: c.name || '',
      phone: c.phone,
      city: c.city || '',
      tag: c.tag || tag,
      group_name: groupTop || c.group_name || '',
      extra_fields: c.extra_fields || {}
    }));

    const saveBtn = document.getElementById('save-contacts-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando...'; }

    try {
      const result = await API.post('/api/contacts', contacts);
      Modal.close();
      toast(`${result.inserted} contato(s) salvo(s) com sucesso!`);
      this.render();
    } catch(e) {
      toast('Erro ao salvar contatos: ' + e.message, 'error');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = `Salvar ${valid.length} contato(s) válido(s)`; }
    }
  }
};
