const History = {
  async render() {
    setContent('<div class="loading-spinner-wrap"><div class="spinner"></div></div>');
    try {
      const campaigns = await API.get('/api/campaigns');
      setContent(this.buildHTML(campaigns));
    } catch (e) {
      setContent('<div class="alert alert-danger">Erro ao carregar histórico.</div>');
    }
  },

  buildHTML(campaigns) {
    const rows = campaigns.map(c => {
      const rate = successRate(c.sent, c.failed);
      const actions = [];

      if (['draft', 'paused'].includes(c.status)) {
        actions.push(`<a href="#/campanhas/${c.id}/executar" class="btn btn-sm btn-primary">Executar</a>`);
      }
      if (c.status === 'running') {
        actions.push(`<a href="#/campanhas/${c.id}/executar" class="btn btn-sm btn-primary">Acompanhar</a>`);
      }
      if (['completed', 'cancelled', 'failed'].includes(c.status) || c.sent > 0 || c.failed > 0) {
        actions.push(`<a href="#/campanhas/${c.id}/relatorio" class="btn btn-sm btn-secondary">Relatório</a>`);
      }
      actions.push(`<button class="btn-icon" onclick="History.duplicate(${c.id})" title="Duplicar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      </button>`);
      actions.push(`<button class="btn-icon danger" onclick="History.deleteCampaign(${c.id}, '${escHtml(c.name).replace(/'/g, "\\'")}')" title="Excluir">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
      </button>`);

      return `
        <tr>
          <td><strong>${escHtml(c.name)}</strong></td>
          <td>${statusBadge(c.status)}</td>
          <td>${fmtDate(c.created_at)}</td>
          <td>${c.total_contacts}</td>
          <td class="text-green fw-600">${c.sent}</td>
          <td class="${c.failed > 0 ? 'text-red' : ''}">${c.failed}</td>
          <td>${c.pending}</td>
          <td>${rate}</td>
          <td>
            <div class="flex gap-8">${actions.join('')}</div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="page-header">
        <h1>Histórico de Campanhas</h1>
        <a href="#/campanhas/nova" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Nova Campanha
        </a>
      </div>

      <div class="card">
        ${campaigns.length === 0 ? `
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <h3>Nenhuma campanha encontrada</h3>
            <p>Crie sua primeira campanha de disparo</p>
            <a href="#/campanhas/nova" class="btn btn-primary">Nova Campanha</a>
          </div>
        ` : `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th><th>Status</th><th>Criada em</th><th>Total</th>
                  <th>Enviadas</th><th>Falhas</th><th>Pendentes</th><th>Taxa</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `}
      </div>
    `;
  },

  async duplicate(id) {
    try {
      const result = await API.post(`/api/campaigns/${id}/duplicate`, {});
      toast('Campanha duplicada com sucesso!');
      window.location.hash = `#/campanhas/${result.id}/executar`;
    } catch (e) {
      toast('Erro ao duplicar campanha', 'error');
    }
  },

  deleteCampaign(id, name) {
    Modal.confirm({
      title: 'Excluir campanha',
      message: `Excluir campanha "${name}" e todos os seus logs? Esta ação não pode ser desfeita.`,
      confirmText: 'Excluir',
    }, async () => {
      try {
        await API.del(`/api/campaigns/${id}`);
        toast('Campanha excluída');
        this.render();
      } catch (e) {
        toast('Erro ao excluir campanha', 'error');
      }
    });
  }
};
