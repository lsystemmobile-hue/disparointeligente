const Reports = {
  reportData: null,

  async render(id) {
    setContent('<div class="loading-spinner-wrap"><div class="spinner"></div></div>');
    try {
      const data = await API.get(`/api/campaigns/${id}/report`);
      this.reportData = data;
      setContent(this.buildHTML(data));
      this.bindFilter(id);
    } catch(e) {
      setContent('<div class="alert alert-danger">Relatório não encontrado.</div>');
    }
  },

  buildHTML(data) {
    const { campaign: c, stats, logs } = data;
    const duration = fmtDuration(c.started_at, c.completed_at);

    const logsHTML = this.buildLogsTable(logs);

    return `
      <div class="page-header">
        <h1>Relatório: ${escHtml(c.name)}</h1>
        <div class="flex gap-8">
          ${statusBadge(c.status)}
          <button class="btn btn-secondary btn-sm" onclick="Reports.exportCSV()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar CSV
          </button>
        </div>
      </div>

      <!-- STATS -->
      <div class="report-grid">
        <div class="report-stat green">
          <div class="r-value">${stats.sent}</div>
          <div class="r-label">Enviadas</div>
        </div>
        <div class="report-stat red">
          <div class="r-value">${stats.failed}</div>
          <div class="r-label">Falhas</div>
        </div>
        <div class="report-stat orange">
          <div class="r-value">${stats.pending}</div>
          <div class="r-label">Pendentes</div>
        </div>
        <div class="report-stat blue">
          <div class="r-value">${c.total_contacts}</div>
          <div class="r-label">Total</div>
        </div>
        <div class="report-stat ${stats.successRate >= 80 ? 'green' : stats.successRate >= 50 ? 'blue' : 'red'}">
          <div class="r-value">${stats.successRate > 0 ? stats.successRate + '%' : '—'}</div>
          <div class="r-label">Taxa sucesso</div>
        </div>
        <div class="report-stat">
          <div class="r-value" style="font-size:22px;">${duration}</div>
          <div class="r-label">Duração</div>
        </div>
      </div>

      <!-- DATES -->
      <div class="card" style="margin-bottom:20px;">
        <div style="display:flex;gap:32px;font-size:13.5px;flex-wrap:wrap;">
          <div><span class="text-muted">Criada em:</span> <strong>${fmtDate(c.created_at)}</strong></div>
          <div><span class="text-muted">Iniciada em:</span> <strong>${fmtDate(c.started_at)}</strong></div>
          <div><span class="text-muted">Concluída em:</span> <strong>${fmtDate(c.completed_at)}</strong></div>
        </div>
      </div>

      <!-- ACTIONS -->
      <div class="flex gap-8" style="margin-bottom:20px;flex-wrap:wrap;">
        <button class="btn btn-secondary" onclick="Reports.duplicate(${c.id})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          Duplicar Campanha
        </button>
        ${stats.failed > 0 ? `<button class="btn btn-secondary" onclick="Reports.retryFailed(${c.id})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
          Reenviar ${stats.failed} falhadas
        </button>` : ''}
        <a href="#/historico" class="btn btn-ghost">← Voltar ao histórico</a>
      </div>

      <!-- LOGS TABLE -->
      <div class="card">
        <div class="card-header">
          <h2>Logs de Envio</h2>
          <div class="flex gap-8">
            <select id="log-status-filter" onchange="Reports.filterLogs(${c.id})" style="width:auto;font-size:13px;padding:5px 10px;">
              <option value="">Todos os status</option>
              <option value="sent">Enviados</option>
              <option value="failed">Falhas</option>
              <option value="pending">Pendentes</option>
              <option value="cancelled">Cancelados</option>
            </select>
          </div>
        </div>
        <div id="logs-table-wrap">
          ${logsHTML}
        </div>
      </div>
    `;
  },

  buildLogsTable(logs) {
    if (!logs || logs.length === 0) {
      return '<div class="empty-state"><p>Nenhum log encontrado</p></div>';
    }

    const rows = logs.map(l => {
      const apiData = l.api_response ? (() => { try { return JSON.parse(l.api_response); } catch { return {}; } })() : {};
      const apiInfo = apiData.key?.id ? `ID: ${escHtml(apiData.key.id.slice(0, 16))}...` : (l.error_reason ? escHtml(l.error_reason.slice(0, 60)) : '—');

      return `
        <tr>
          <td>${statusBadge(l.status)}</td>
          <td>${escHtml(l.contact_name || '—')}</td>
          <td style="font-family:monospace;font-size:12px;">${escHtml(l.phone)}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(l.message_sent || '')}">${escHtml((l.message_sent || '').slice(0, 60))}${l.message_sent?.length > 60 ? '...' : ''}</td>
          <td style="font-size:12px;color:var(--text-muted);">${apiInfo}</td>
          <td style="font-size:12px;color:var(--text-muted);white-space:nowrap;">${fmtDate(l.sent_at)}</td>
          <td style="font-size:12px;text-align:center;color:var(--text-muted);">${l.attempt_number}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Status</th><th>Nome</th><th>Telefone</th><th>Mensagem</th>
              <th>Resposta API</th><th>Enviado em</th><th>Tentativa</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${logs.length >= 200 ? `<div style="padding:10px 14px;color:var(--text-muted);font-size:12.5px;">Exibindo os 200 registros mais recentes.</div>` : ''}
    `;
  },

  bindFilter(id) {},

  async filterLogs(id) {
    const status = document.getElementById('log-status-filter')?.value || '';
    const url = `/api/campaigns/${id}/logs?limit=200${status ? `&status=${status}` : ''}`;
    try {
      const logs = await API.get(url);
      const wrap = document.getElementById('logs-table-wrap');
      if (wrap) wrap.innerHTML = this.buildLogsTable(logs);
    } catch(e) {}
  },

  exportCSV() {
    if (!this.reportData) return;
    const { campaign: c, logs } = this.reportData;
    const header = ['status', 'nome', 'telefone', 'mensagem_enviada', 'motivo_falha', 'resposta_api', 'enviado_em', 'tentativa'];
    const rows = logs.map(l => [
      l.status,
      l.contact_name || '',
      l.phone,
      (l.message_sent || '').replace(/\n/g, ' '),
      l.error_reason || '',
      l.api_response || '',
      l.sent_at || '',
      l.attempt_number
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${c.name.replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV exportado com sucesso!');
  },

  async duplicate(id) {
    try {
      const result = await API.post(`/api/campaigns/${id}/duplicate`, {});
      toast('Campanha duplicada!');
      window.location.hash = `#/campanhas/${result.id}/executar`;
    } catch(e) { toast('Erro ao duplicar', 'error'); }
  },

  async retryFailed(id) {
    try {
      const result = await API.post(`/api/campaigns/${id}/retry-failed`, {});
      toast('Nova campanha criada com os contatos que falharam!');
      window.location.hash = `#/campanhas/${result.id}/executar`;
    } catch(e) { toast('Erro: ' + e.message, 'error'); }
  }
};
