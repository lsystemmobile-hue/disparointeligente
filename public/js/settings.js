const Settings = {
  async render() {
    setContent('<div class="loading-spinner-wrap"><div class="spinner"></div></div>');
    let cfg = {};
    try { cfg = await API.get('/api/settings'); } catch (e) {}
    setContent(this.buildHTML(cfg));
    this.bindEvents();
  },

  buildHTML(cfg) {
    const endpoint = cfg.baseUrl && cfg.instanceName
      ? `${cfg.baseUrl}/message/sendText/${cfg.instanceName}`
      : '(preencha URL e instância)';

    return `
      <div class="page-header">
        <h1>Configurações da API</h1>
      </div>

      <div class="card" style="max-width: 640px;">
        <div class="form-group">
          <label>URL Base da Evolution API</label>
          <input type="url" id="cfg-baseUrl" value="${escHtml(cfg.baseUrl || '')}" placeholder="https://sua-api.exemplo.com">
          <div class="form-hint">Sem barra no final. Ex: https://api.meuservidor.com</div>
        </div>

        <div class="form-group">
          <label>Nome da Instância</label>
          <input type="text" id="cfg-instanceName" value="${escHtml(cfg.instanceName || '')}" placeholder="minha-instancia">
          <div class="form-hint">Nome exato da instância configurada no painel da Evolution API</div>
        </div>

        <div class="form-group">
          <label>API Key</label>
          <div class="input-group">
            <input type="password" id="cfg-apiKey" value="${escHtml(cfg.apiKey || '')}" placeholder="Sua chave de API">
            <button class="btn btn-secondary" onclick="Settings.toggleApiKey()" type="button">Mostrar</button>
          </div>
        </div>

        <div class="form-group">
          <label>Endpoint de envio (montado automaticamente)</label>
          <div id="endpoint-preview" style="background:var(--bg); padding:10px 14px; border-radius:var(--radius-sm); font-family:monospace; font-size:12.5px; word-break:break-all; color:var(--text-muted); border:1px solid var(--border);">
            POST ${escHtml(endpoint)}
          </div>
        </div>

        <div style="margin-top: 8px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
          <button class="btn btn-primary btn-lg" onclick="Settings.save()">Salvar Configurações</button>
          <button class="btn btn-secondary" onclick="Settings.testConnection()">Testar Conexão</button>
        </div>

        <div id="connection-result" style="margin-top: 12px;"></div>
      </div>

      <div class="card" style="max-width: 640px; margin-top: 20px;">
        <div class="card-header"><h2>Formato da requisição enviada</h2></div>
        <div style="background:var(--bg); border-radius:var(--radius-sm); padding:16px; font-family:monospace; font-size:12.5px; line-height:1.8; border:1px solid var(--border);">
          <div style="color:var(--info); font-weight:600;">POST ${escHtml(endpoint)}</div>
          <br>
          <div style="color:var(--text-muted);">Headers:</div>
          <div>&nbsp;&nbsp;apikey: ${escHtml(cfg.apiKey ? cfg.apiKey.slice(0,6) + '...' : '{{apiKey}}')}</div>
          <div>&nbsp;&nbsp;Content-Type: application/json</div>
          <br>
          <div style="color:var(--text-muted);">Body:</div>
          <div>{</div>
          <div>&nbsp;&nbsp;"number": "55 + telefone do contato",</div>
          <div>&nbsp;&nbsp;"text": "mensagem sorteada"</div>
          <div>}</div>
        </div>
      </div>
    `;
  },

  bindEvents() {
    ['cfg-baseUrl', 'cfg-instanceName'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.updateEndpointPreview());
    });
  },

  updateEndpointPreview() {
    const base = document.getElementById('cfg-baseUrl')?.value?.trim().replace(/\/$/, '') || '';
    const inst = document.getElementById('cfg-instanceName')?.value?.trim() || '';
    const preview = document.getElementById('endpoint-preview');
    if (preview) {
      const ep = base && inst ? `${base}/message/sendText/${inst}` : '(preencha URL e instância)';
      preview.textContent = `POST ${ep}`;
    }
  },

  toggleApiKey() {
    const el = document.getElementById('cfg-apiKey');
    if (!el) return;
    el.type = el.type === 'password' ? 'text' : 'password';
  },

  async save() {
    const payload = {
      baseUrl: (document.getElementById('cfg-baseUrl')?.value?.trim() || '').replace(/\/$/, ''),
      instanceName: document.getElementById('cfg-instanceName')?.value?.trim() || '',
      apiKey: document.getElementById('cfg-apiKey')?.value?.trim() || '',
    };
    try {
      await API.post('/api/settings', payload);
      toast('Configurações salvas com sucesso!');
      this.updateEndpointPreview();
    } catch (e) {
      toast('Erro ao salvar configurações', 'error');
    }
  },

  async testConnection() {
    const resultEl = document.getElementById('connection-result');
    if (resultEl) resultEl.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;"></div>';

    await this.save();
    try {
      const result = await API.post('/api/test-connection', {});
      if (result.ok) {
        resultEl.innerHTML = `<div class="connection-status status-ok"><div class="dot"></div> Conexão bem-sucedida! (HTTP ${result.status})</div>`;
      } else {
        const msg = result.message || (result.data ? JSON.stringify(result.data) : `HTTP ${result.status}`);
        resultEl.innerHTML = `<div class="connection-status status-fail"><div class="dot"></div> Falha: ${escHtml(msg)}</div>`;
      }
    } catch (e) {
      resultEl.innerHTML = `<div class="connection-status status-fail"><div class="dot"></div> Erro: ${escHtml(e.message)}</div>`;
    }
  }
};
