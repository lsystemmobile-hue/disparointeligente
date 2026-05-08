const Execution = {
  campaignId: null,

  async render(id) {
    this.campaignId = id;
    if (window._executionPoller) { clearInterval(window._executionPoller); window._executionPoller = null; }
    this.stopCountdown();
    setContent('<div class="loading-spinner-wrap"><div class="spinner"></div></div>');
    try {
      const data = await API.get(`/api/campaigns/${id}/status`);
      setContent(this.buildHTML(data));
      // Só inicia polling se campanha já estiver rodando ou pausada
      if (['running', 'paused'].includes(data.status)) {
        this.startPolling();
      }
    } catch(e) {
      setContent('<div class="alert alert-danger">Campanha não encontrada.</div>');
    }
  },

  buildHTML(data) {
    const total = data.total_contacts || 0;
    const sent  = data.sent || 0;
    const failed = data.failed || 0;
    const pending = data.pending || 0;
    const processed = sent + failed;
    const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
    const variants = JSON.parse(data.message_variants || '[]');
    const cadence  = JSON.parse(data.cadence_config  || '{}');

    const currentContact = data.next_pending?.[0];
    const nextContact    = data.next_pending?.[1];
    const lastSent       = data.last_sent;

    const controls = this.buildControls(data.status);

    return `
      <div class="page-header">
        <h1>${escHtml(data.name)}</h1>
        <div class="flex gap-8">
          ${statusBadge(data.status)}
          <a href="#/campanhas/${this.campaignId}/relatorio" class="btn btn-secondary btn-sm">Ver Relatório</a>
        </div>
      </div>

      ${data.status === 'draft' ? `
        <div class="alert alert-info" style="margin-bottom:16px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Campanha pronta para iniciar. Clique em <strong>Iniciar Campanha</strong> quando quiser começar o disparo.
        </div>
      ` : ''}

      <div class="execution-grid">
        <!-- LEFT -->
        <div>
          <div class="card" style="margin-bottom:16px;">
            <div style="font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px;">Progresso</div>

            <!-- Mini stat metrics -->
            <div class="exec-mini-stats" style="gap:10px;margin-bottom:18px;">
              <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px 8px;text-align:center;">
                <div style="font-size:28px;font-weight:800;color:var(--accent-dark);letter-spacing:-1px;line-height:1;" id="stat-sent">${sent}</div>
                <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Enviadas</div>
              </div>
              <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px 8px;text-align:center;">
                <div style="font-size:28px;font-weight:800;color:var(--danger);letter-spacing:-1px;line-height:1;" id="stat-failed">${failed}</div>
                <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Falhas</div>
              </div>
              <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px 8px;text-align:center;">
                <div style="font-size:28px;font-weight:800;color:var(--text);letter-spacing:-1px;line-height:1;" id="stat-pending">${pending}</div>
                <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Pendentes</div>
              </div>
              <div style="background:var(--bg);border-radius:var(--radius-sm);padding:12px 8px;text-align:center;">
                <div style="font-size:28px;font-weight:800;color:var(--info);letter-spacing:-1px;line-height:1;" id="stat-rate">${successRate(sent, failed)}</div>
                <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Taxa</div>
              </div>
            </div>

            <!-- Overall progress bar -->
            <div style="border-top:1px solid var(--border);padding-top:16px;">
              <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;">
                <div class="exec-counter" id="exec-counter">${processed} <span>de ${total}</span></div>
                <div style="font-size:12.5px;color:var(--text-muted);">
                  ETA <strong id="exec-eta" style="color:var(--text);">${fmtEta(pending, cadence)}</strong>
                </div>
              </div>
              <div class="progress-bar" style="margin-bottom:0;">
                <div class="progress-bar-fill" id="exec-progress" style="width:${pct}%"></div>
              </div>
            </div>

            <!-- Countdown -->
            <div id="exec-countdown" style="min-height:0;margin-top:14px;"></div>
          </div>

          <div class="card" style="margin-bottom:16px;">
            <div class="execution-info-row">
              <div class="execution-info-item">
                <div class="label">Contato atual</div>
                <div class="value" id="exec-current">${currentContact ? escHtml(currentContact.db_name || currentContact.contact_name || currentContact.phone) : '—'}</div>
              </div>
              <div class="execution-info-item">
                <div class="label">Próximo contato</div>
                <div class="value" id="exec-next" style="color:var(--text-muted);">${nextContact ? escHtml(nextContact.db_name || nextContact.contact_name || nextContact.phone) : '—'}</div>
              </div>
            </div>
          </div>

          <div class="card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">
                ${lastSent ? 'Última mensagem enviada' : 'Prévia das mensagens'}
              </div>
              ${lastSent ? statusBadge(lastSent.status) : ''}
            </div>
            ${lastSent ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">${escHtml(lastSent.db_name || lastSent.contact_name || lastSent.phone)}</div>` : ''}
            <div class="message-preview" id="exec-last-msg">${escHtml(lastSent ? lastSent.message_sent : (variants[0] || '—'))}</div>
            ${!lastSent && variants.length > 1 ? `<div style="font-size:12px;color:var(--text-muted);margin-top:8px;">+ ${variants.length - 1} variação(ões) sorteadas aleatoriamente</div>` : ''}
          </div>
        </div>

        <!-- RIGHT -->
        <div>
          <div class="card" style="margin-bottom:16px;">
            <div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px;">Controles</div>
            <div class="execution-controls" id="exec-controls">${controls}</div>
          </div>

          <div class="card">
            <div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Cadência</div>
            <div style="font-size:12.5px;color:var(--text-muted);line-height:1.9;">
              Intervalo: <strong style="color:var(--text);">${cadence.minInterval || 20}–${cadence.maxInterval || 60}s</strong><br>
              Lote: <strong style="color:var(--text);">${cadence.batchSize || 10} msgs</strong> → pausa <strong style="color:var(--text);">${cadence.batchPause || 300}s</strong><br>
              ${cadence.maxSends > 0 ? `Limite: <strong style="color:var(--text);">${cadence.maxSends} envios</strong>` : 'Sem limite de envios'}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  buildControls(status) {
    if (status === 'draft') {
      return `<button class="btn btn-primary btn-lg" style="width:100%" onclick="Execution.start()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Iniciar Campanha
      </button>`;
    }
    if (status === 'running') {
      return `
        <button class="btn btn-secondary" onclick="Execution.pause()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          Pausar
        </button>
        <button class="btn btn-danger" onclick="Execution.cancel()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Cancelar
        </button>`;
    }
    if (status === 'paused') {
      return `
        <button class="btn btn-primary" onclick="Execution.resume()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Continuar
        </button>
        <button class="btn btn-danger" onclick="Execution.cancel()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Cancelar
        </button>`;
    }
    if (status === 'completed') {
      return `
        <div class="alert alert-success" style="width:100%;margin:0;">✓ Campanha concluída com sucesso!</div>
        <a href="#/campanhas/${this.campaignId}/relatorio" class="btn btn-secondary" style="width:100%;margin-top:10px;">Ver Relatório Completo</a>`;
    }
    if (status === 'cancelled') {
      return `
        <div class="alert alert-warning" style="width:100%;margin:0;">Campanha cancelada.</div>
        <a href="#/campanhas/${this.campaignId}/relatorio" class="btn btn-secondary" style="width:100%;margin-top:10px;">Ver Relatório</a>`;
    }
    return '';
  },

  startPolling() {
    if (window._executionPoller) clearInterval(window._executionPoller);
    window._executionPoller = setInterval(() => this.poll(), 2000);
  },

  async poll() {
    try {
      const data = await API.get(`/api/campaigns/${this.campaignId}/status`);
      this.updateUI(data);
      if (['completed', 'cancelled'].includes(data.status)) {
        clearInterval(window._executionPoller);
        window._executionPoller = null;
      }
    } catch(e) {}
  },

  updateUI(data) {
    const total = data.total_contacts || 0;
    const sent  = data.sent || 0;
    const failed = data.failed || 0;
    const pending = data.pending || 0;
    const processed = sent + failed;
    const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
    const cadence = JSON.parse(data.cadence_config || '{}');

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };

    set('exec-counter', `${processed} <span>de ${total}</span>`);
    set('exec-eta', fmtEta(pending, cadence));
    set('stat-sent', sent);
    set('stat-failed', failed);
    set('stat-pending', pending);
    set('stat-rate', successRate(sent, failed));

    const progressEl = document.getElementById('exec-progress');
    if (progressEl) progressEl.style.width = `${pct}%`;

    const currentContact = data.next_pending?.[0];
    const nextContact    = data.next_pending?.[1];
    set('exec-current', currentContact ? escHtml(currentContact.db_name || currentContact.contact_name || currentContact.phone) : '—');
    set('exec-next', nextContact ? escHtml(nextContact.db_name || nextContact.contact_name || nextContact.phone) : '—');

    if (data.last_sent?.message_sent) {
      set('exec-last-msg', escHtml(data.last_sent.message_sent));
    }

    // Countdown ao próximo envio
    if (data.status === 'running') {
      if (data.next_send_at) {
        this.startCountdown(data.next_send_at);
      } else {
        this.stopCountdown();
        set('exec-countdown', this._sendingBadge());
      }
    } else {
      this.stopCountdown();
    }

    // Atualiza controles sem sobrescrever se o status não mudou
    const controlsEl = document.getElementById('exec-controls');
    if (controlsEl) {
      controlsEl.innerHTML = this.buildControls(data.status);
    }
  },

  startCountdown(nextSendAt) {
    if (window._countdownTimer && this._countdownTarget === nextSendAt) return;
    if (window._countdownTimer) clearInterval(window._countdownTimer);
    this._countdownTarget = nextSendAt;
    this._countdownStartAt = Date.now();
    window._countdownTimer = setInterval(() => {
      const el = document.getElementById('exec-countdown');
      if (!el) { clearInterval(window._countdownTimer); window._countdownTimer = null; return; }
      const now = Date.now();
      const remaining = nextSendAt - now;
      if (remaining <= 0) {
        el.innerHTML = this._sendingBadge();
        return;
      }
      const total = nextSendAt - this._countdownStartAt;
      const barPct = total > 0 ? Math.max(0, (remaining / total) * 100) : 0;
      const s = Math.ceil(remaining / 1000);
      const display = s >= 60
        ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
        : `${s}s`;
      el.innerHTML = `
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
            <span style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:5px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Próximo envio em
            </span>
            <strong style="font-size:13.5px;font-variant-numeric:tabular-nums;">${display}</strong>
          </div>
          <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;">
            <div style="height:100%;width:${barPct.toFixed(1)}%;background:var(--accent);border-radius:2px;transition:width 0.35s linear;"></div>
          </div>
        </div>`;
    }, 400);
  },

  _sendingBadge() {
    return `<span class="badge badge-green badge-pulse" style="font-size:12px;padding:4px 12px;">
      Enviando mensagem
    </span>`;
  },

  stopCountdown() {
    if (window._countdownTimer) { clearInterval(window._countdownTimer); window._countdownTimer = null; }
    const el = document.getElementById('exec-countdown');
    if (el) el.innerHTML = '';
  },

  async start() {
    const btn = document.querySelector('#exec-controls button');
    if (btn) { btn.disabled = true; btn.textContent = 'Iniciando...'; }
    try {
      await API.post(`/api/campaigns/${this.campaignId}/start`, {});
      toast('Campanha iniciada!');
      // Atualiza controles imediatamente sem esperar o poll
      const controlsEl = document.getElementById('exec-controls');
      if (controlsEl) controlsEl.innerHTML = this.buildControls('running');
      this.startPolling();
    } catch(e) {
      toast('Erro ao iniciar', 'error');
      const controlsEl = document.getElementById('exec-controls');
      if (controlsEl) controlsEl.innerHTML = this.buildControls('draft');
    }
  },

  async pause() {
    try {
      await API.post(`/api/campaigns/${this.campaignId}/pause`, {});
      toast('Campanha pausada', 'info');
      const controlsEl = document.getElementById('exec-controls');
      if (controlsEl) controlsEl.innerHTML = this.buildControls('paused');
    } catch(e) { toast('Erro ao pausar', 'error'); }
  },

  async resume() {
    try {
      await API.post(`/api/campaigns/${this.campaignId}/resume`, {});
      toast('Campanha retomada!');
      const controlsEl = document.getElementById('exec-controls');
      if (controlsEl) controlsEl.innerHTML = this.buildControls('running');
    } catch(e) { toast('Erro ao retomar', 'error'); }
  },

  cancel() {
    Modal.confirm({
      title: 'Cancelar campanha',
      message: 'Cancelar campanha? Os contatos pendentes serão marcados como cancelados.',
      confirmText: 'Cancelar campanha',
    }, async () => {
      try {
        await API.post(`/api/campaigns/${this.campaignId}/cancel`, {});
        toast('Campanha cancelada', 'warning');
        clearInterval(window._executionPoller);
        window._executionPoller = null;
        const controlsEl = document.getElementById('exec-controls');
        if (controlsEl) controlsEl.innerHTML = this.buildControls('cancelled');
      } catch(e) { toast('Erro ao cancelar', 'error'); }
    });
  }
};
