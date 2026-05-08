const Dashboard = {
  async render() {
    setContent('<div class="loading-spinner-wrap"><div class="spinner"></div></div>');
    try {
      const data = await API.get('/api/dashboard');
      setContent(this.buildHTML(data));
    } catch (e) {
      setContent('<div class="alert alert-danger">Erro ao carregar dashboard.</div>');
    }
  },

  buildHTML(d) {
    const campaigns = d.recentCampaigns || [];

    const campaignsHTML = campaigns.length === 0
      ? `<div class="empty-state">
           <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg>
           <h3>Nenhuma campanha ainda</h3>
           <p>Crie sua primeira campanha de disparo</p>
           <a href="#/campanhas/nova" class="btn btn-primary">Nova Campanha</a>
         </div>`
      : campaigns.map(c => `
          <tr>
            <td><strong>${escHtml(c.name)}</strong></td>
            <td>${statusBadge(c.status)}</td>
            <td>${fmtDate(c.created_at)}</td>
            <td>${c.total_contacts}</td>
            <td class="text-green fw-600">${c.sent}</td>
            <td class="text-red">${c.failed}</td>
            <td>${successRate(c.sent, c.failed)}</td>
            <td>
              <div class="flex gap-8">
                ${['running','paused'].includes(c.status) ? `<a href="#/campanhas/${c.id}/executar" class="btn btn-sm btn-primary">Acompanhar</a>` : ''}
                ${c.status === 'completed' || c.status === 'cancelled' ? `<a href="#/campanhas/${c.id}/relatorio" class="btn btn-sm btn-secondary">Relatório</a>` : ''}
                ${c.status === 'draft' ? `<a href="#/campanhas/${c.id}/executar" class="btn btn-sm btn-primary">Iniciar</a>` : ''}
              </div>
            </td>
          </tr>
        `).join('');

    return `
      <div class="page-header">
        <h1>Dashboard</h1>
        <div class="page-header-actions">
          <a href="#/campanhas/nova" class="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Nova Campanha
          </a>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Contatos</div>
          <div class="stat-value blue">${d.totalContacts.toLocaleString()}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Campanhas</div>
          <div class="stat-value">${d.totalCampaigns}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Ativas agora</div>
          <div class="stat-value ${d.activeCampaigns > 0 ? 'green' : ''}">${d.activeCampaigns}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Enviadas</div>
          <div class="stat-value green">${d.totalSent.toLocaleString()}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Pendentes</div>
          <div class="stat-value orange">${d.totalPending.toLocaleString()}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Falhas</div>
          <div class="stat-value ${d.totalFailed > 0 ? 'red' : ''}">${d.totalFailed.toLocaleString()}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Taxa de Sucesso</div>
          <div class="stat-value ${d.successRate >= 80 ? 'green' : d.successRate >= 50 ? 'orange' : 'red'}">${d.successRate > 0 ? d.successRate + '%' : '—'}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Campanhas Recentes</h2>
          <a href="#/historico" class="btn btn-ghost btn-sm">Ver todas →</a>
        </div>
        ${campaigns.length === 0 ? `<div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg>
          <h3>Nenhuma campanha ainda</h3>
          <p>Crie sua primeira campanha</p>
          <a href="#/campanhas/nova" class="btn btn-primary">Nova Campanha</a>
        </div>` : `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th><th>Status</th><th>Criada em</th><th>Contatos</th>
                <th>Enviadas</th><th>Falhas</th><th>Taxa</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>${campaignsHTML}</tbody>
          </table>
        </div>`}
      </div>
    `;
  }
};

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
