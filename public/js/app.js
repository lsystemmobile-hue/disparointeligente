// ── ROTEADOR ──────────────────────────────────────────────────────────────────
// Mapeia fragmentos de URL (#/rota) para os módulos que renderizam cada página.
// Ao mudar o hash, o handler correspondente é chamado e o nav é atualizado.

const ROUTES = [
  { pattern: /^\/dashboard$/,                   handler: ()  => Dashboard.render()       },
  { pattern: /^\/contatos$/,                    handler: ()  => Contacts.render()        },
  { pattern: /^\/campanhas\/nova$/,             handler: ()  => Campaigns.renderNew()    },
  { pattern: /^\/campanhas\/(\d+)\/executar$/,  handler: (m) => Execution.render(m[1])   },
  { pattern: /^\/campanhas\/(\d+)\/relatorio$/, handler: (m) => Reports.render(m[1])     },
  { pattern: /^\/historico$/,                   handler: ()  => History.render()         },
  { pattern: /^\/configuracoes$/,               handler: ()  => Settings.render()        },
];

function route() {
  const hash = window.location.hash.slice(1) || '/dashboard';
  for (const r of ROUTES) {
    const m = hash.match(r.pattern);
    if (m) { r.handler(m); updateNav(hash); return; }
  }
  // Rota não encontrada → redireciona para o dashboard
  Dashboard.render();
  updateNav('/dashboard');
}

// Marca o link ativo no menu lateral com base na rota atual
function updateNav(hash) {
  document.querySelectorAll('.nav-link').forEach(link => {
    const path = link.getAttribute('data-path');
    link.classList.toggle('active', hash.startsWith(path));
  });
}

window.addEventListener('hashchange', () => {
  // Para todos os timers da página de execução ao navegar para fora
  if (window._executionPoller) { clearInterval(window._executionPoller); window._executionPoller = null; }
  if (window._countdownTimer)  { clearInterval(window._countdownTimer);  window._countdownTimer  = null; }
  route();
});
window.addEventListener('load', route);

// ── HELPERS DE API ────────────────────────────────────────────────────────────
// Funções centralizadas para chamadas HTTP ao backend Express.
// Todas retornam JSON; erros de rede lançam exceções.

const API = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json();
  },
  async patch(url, body) {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json();
  },
  async del(url, body) {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    return res.json();
  },
  async upload(url, formData) {
    // Envio de arquivo (multipart/form-data) — sem Content-Type manual (o browser define o boundary)
    const res = await fetch(url, { method: 'POST', body: formData });
    return res.json();
  }
};

// ── HELPERS DE UI ─────────────────────────────────────────────────────────────

// Substitui o conteúdo da área principal da página
function setContent(html) {
  document.getElementById('page-content').innerHTML = html;
}

// Exibe uma notificação temporária no canto da tela (3,5 segundos)
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// Formata uma data ISO para exibição no padrão brasileiro (DD/MM/AAAA HH:MM)
function fmtDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Calcula e formata a duração entre dois timestamps (início e fim de campanha)
function fmtDuration(start, end) {
  if (!start) return '—';
  const ms = new Date(end || Date.now()) - new Date(start);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m >= 60) return `${Math.floor(m/60)}h ${m%60}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Retorna um badge HTML colorido de acordo com o status da campanha ou log
function statusBadge(status) {
  const map = {
    draft:     ['badge-gray',             'Rascunho'],
    running:   ['badge-blue badge-pulse', 'Em andamento'],
    paused:    ['badge-yellow',           'Pausada'],
    completed: ['badge-green',            'Concluída'],
    cancelled: ['badge-gray',             'Cancelada'],
    sent:      ['badge-green',            'Enviado'],
    failed:    ['badge-red',              'Falhou'],
    pending:   ['badge-yellow',           'Pendente'],
  };
  const [cls, label] = map[status] || ['badge-gray', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

// Calcula a taxa de sucesso (%) a partir de enviados e falhos
function successRate(sent, failed) {
  const total = (sent || 0) + (failed || 0);
  if (total === 0) return '—';
  return `${Math.round(((sent || 0) / total) * 100)}%`;
}

// Estima o tempo restante de campanha com base na cadência configurada
function fmtEta(pending, cadence) {
  if (!pending || pending === 0) return '—';
  const cfg = cadence || {};
  const avg = ((parseInt(cfg.minInterval) || 20) + (parseInt(cfg.maxInterval) || 60)) / 2;
  const batchSize  = parseInt(cfg.batchSize)  || 10;
  const batchPause = parseInt(cfg.batchPause) || 300;
  const batches    = Math.floor(pending / batchSize);
  const totalSecs  = pending * avg + batches * batchPause;
  if (totalSecs < 60)   return `~${Math.round(totalSecs)}s`;
  if (totalSecs < 3600) return `~${Math.round(totalSecs / 60)}min`;
  const h = Math.floor(totalSecs / 3600);
  const m = Math.round((totalSecs % 3600) / 60);
  return `~${h}h ${m}min`;
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
// Sistema de diálogos modais reutilizáveis (informação, confirmação etc.)

const Modal = {
  // Abre um modal com HTML customizado
  open(html) {
    document.getElementById('modal-box').innerHTML = html;
    document.getElementById('modal-overlay').style.display = 'flex';
  },
  close() {
    document.getElementById('modal-overlay').style.display = 'none';
    document.getElementById('modal-box').innerHTML = '';
  },
  // Fecha ao clicar no overlay escuro ao redor do modal
  closeOnOverlay(e) {
    if (e.target === document.getElementById('modal-overlay')) this.close();
  },
  // Abre um modal de confirmação com botão de confirmar e cancelar
  confirm({ title = 'Confirmar', message, confirmText = 'Confirmar', confirmClass = 'btn-danger' }, onConfirm) {
    this.open(`
      <div class="modal-header">
        <h2>${escHtml(title)}</h2>
        <button class="btn-icon" onclick="Modal.close()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <p style="margin:0;line-height:1.6;font-size:14px;">${escHtml(message)}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
        <button class="btn ${confirmClass}" id="modal-confirm-btn">${escHtml(confirmText)}</button>
      </div>
    `);
    document.getElementById('modal-confirm-btn').onclick = () => {
      Modal.close();
      onConfirm();
    };
  }
};
