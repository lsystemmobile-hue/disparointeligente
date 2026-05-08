const fetch = require('node-fetch');
const db = require('./database');

const runningCampaigns = new Map();
const nextSendTimes = new Map(); // campaignId → timestamp (ms) ou null (enviando agora)

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function applyVariables(template, contact) {
  let result = template
    .replace(/\{\{nome\}\}/gi, contact.name || '')
    .replace(/\{\{telefone\}\}/gi, contact.phone || '')
    .replace(/\{\{cidade\}\}/gi, contact.city || '');
  try {
    const extras = JSON.parse(contact.extra_fields || '{}');
    for (const [key, value] of Object.entries(extras)) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`\\{\\{${escaped}\\}\\}`, 'gi'), value || '');
    }
  } catch {}
  return result;
}

function isWithinAllowedHours(hourStart, hourEnd) {
  const hour = new Date().getHours();
  const start = parseInt(hourStart) || 0;
  let end = parseInt(hourEnd);
  // 0 ou inválido = meia-noite = fim do dia (24h)
  if (!end || end <= 0) end = 24;
  // Se start >= end, libera o dia todo (configuração inválida — não bloqueia)
  if (start >= end) return true;
  return hour >= start && hour < end;
}

async function sendMessage(phone, text) {
  const baseUrl = (getSetting('baseUrl') || '').trim().replace(/\/$/, '');
  const instanceName = (getSetting('instanceName') || '').trim();
  const apiKey = (getSetting('apiKey') || '').trim();

  if (!baseUrl || !instanceName) {
    throw new Error('Evolution API não configurada. Acesse Configurações da API antes de disparar.');
  }

  const endpoint = `${baseUrl}/message/sendText/${instanceName}`;
  const body = { number: phone, text };

  console.log(`\n>>> REQUEST:`);
  console.log(`    POST ${endpoint}`);
  console.log(`    apikey: ${apiKey.slice(0, 8)}...`);
  console.log(`    body: ${JSON.stringify(body)}\n`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const responseText = await response.text();
    console.log(`<<< RESPONSE: HTTP ${response.status} — ${responseText.slice(0, 300)}\n`);
    let data;
    try { data = JSON.parse(responseText); } catch { data = { raw: responseText }; }
    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Timeout: API não respondeu em 20s');
    throw err;
  }
}

async function runCampaign(campaignId) {
  let sentInBatch = 0;

  async function processNext() {
    nextSendTimes.set(campaignId, null); // indica: processando/enviando agora
    try {
      // ── Verificar status atual ──────────────────────────────────────────────
      const current = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
      if (!current) {
        console.log(`[Campanha #${campaignId}] Não encontrada. Encerrando.`);
        runningCampaigns.delete(campaignId); nextSendTimes.delete(campaignId);
        return;
      }
      if (['paused', 'cancelled', 'completed'].includes(current.status)) {
        console.log(`[Campanha #${campaignId}] Status: ${current.status}. Encerrando loop.`);
        runningCampaigns.delete(campaignId); nextSendTimes.delete(campaignId);
        return;
      }

      // ── Cadência ────────────────────────────────────────────────────────────
      let cadence = {};
      try { cadence = JSON.parse(current.cadence_config || '{}'); } catch {}

      const minInterval = Math.max((parseInt(cadence.minInterval) || 20), 5) * 1000;
      const maxInterval = Math.max((parseInt(cadence.maxInterval) || 60), minInterval / 1000) * 1000;
      const batchSize = parseInt(cadence.batchSize) || 10;
      const batchPause = Math.max((parseInt(cadence.batchPause) || 300), 30) * 1000;
      const hourStart = cadence.hourStart !== undefined ? cadence.hourStart : (getSetting('allowedHourStart') || '8');
      const hourEnd = cadence.hourEnd !== undefined ? cadence.hourEnd : (getSetting('allowedHourEnd') || '20');
      const maxSends = parseInt(cadence.maxSends) || 0;

      // Restrição de horário desabilitada — envia a qualquer hora

      // ── Verificar limite de envios ──────────────────────────────────────────
      if (maxSends > 0 && current.sent >= maxSends) {
        console.log(`[Campanha #${campaignId}] Limite de ${maxSends} envios atingido.`);
        db.prepare("UPDATE campaigns SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaignId);
        runningCampaigns.delete(campaignId); nextSendTimes.delete(campaignId);
        return;
      }

      // ── Verificar variantes ─────────────────────────────────────────────────
      let variants = [];
      try { variants = JSON.parse(current.message_variants || '[]'); } catch {}
      if (variants.length === 0) {
        console.log(`[Campanha #${campaignId}] Sem variantes de mensagem.`);
        db.prepare("UPDATE campaigns SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaignId);
        runningCampaigns.delete(campaignId); nextSendTimes.delete(campaignId);
        return;
      }

      // ── Próximo contato ─────────────────────────────────────────────────────
      const nextLog = db.prepare(
        `SELECT cl.id, cl.phone, cl.contact_name, cl.attempt_number,
                c.name as contact_name_db, c.city as contact_city, c.extra_fields
         FROM campaign_logs cl
         LEFT JOIN contacts c ON cl.contact_id = c.id
         WHERE cl.campaign_id = ? AND cl.status = 'pending'
         LIMIT 1`
      ).get(campaignId);

      if (!nextLog) {
        console.log(`[Campanha #${campaignId}] Nenhum contato pendente. Campanha concluída.`);
        db.prepare("UPDATE campaigns SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaignId);
        runningCampaigns.delete(campaignId); nextSendTimes.delete(campaignId);
        return;
      }

      // ── Sortear mensagem e substituir variáveis ─────────────────────────────
      const variant = variants[Math.floor(Math.random() * variants.length)];
      const message = applyVariables(variant, {
        name: nextLog.contact_name_db || nextLog.contact_name || '',
        phone: nextLog.phone,
        city: nextLog.contact_city || '',
        extra_fields: nextLog.extra_fields || '{}'
      });

          // Garante prefixo 55 (Brasil) que a Evolution API exige
      const phoneToSend = (nextLog.phone.startsWith('55') && nextLog.phone.length > 11)
        ? nextLog.phone
        : `55${nextLog.phone}`;

      console.log(`[Campanha #${campaignId}] Enviando para ${phoneToSend}...`);

      // ── Enviar mensagem ─────────────────────────────────────────────────────
      let status = 'failed';
      let apiResponse = '';
      let errorReason = '';

      try {
        const result = await sendMessage(phoneToSend, message);
        apiResponse = JSON.stringify(result.data);
        if (result.ok) {
          status = 'sent';
          console.log(`[Campanha #${campaignId}] ✓ Enviado para ${phoneToSend}`);
        } else {
          status = 'failed';
          errorReason = `HTTP ${result.status}: ${apiResponse.slice(0, 200)}`;
          console.log(`[Campanha #${campaignId}] ✗ Falhou ${phoneToSend}: HTTP ${result.status}`);
        }
      } catch (sendErr) {
        status = 'failed';
        errorReason = sendErr.message;
        apiResponse = JSON.stringify({ error: sendErr.message });
        console.log(`[Campanha #${campaignId}] ✗ Erro ao enviar para ${phoneToSend}: ${sendErr.message}`);
      }

      // ── Atualizar banco ─────────────────────────────────────────────────────
      db.prepare(
        "UPDATE campaign_logs SET status = ?, message_sent = ?, api_response = ?, error_reason = ?, phone = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(status, message, apiResponse, errorReason, phoneToSend, nextLog.id);

      if (status === 'sent') {
        db.prepare("UPDATE campaigns SET sent = sent + 1, pending = MAX(0, pending - 1) WHERE id = ?").run(campaignId);
      } else {
        db.prepare("UPDATE campaigns SET failed = failed + 1, pending = MAX(0, pending - 1) WHERE id = ?").run(campaignId);
      }

      // ── Agendar próximo ─────────────────────────────────────────────────────
      sentInBatch++;
      let delay;
      if (sentInBatch >= batchSize) {
        sentInBatch = 0;
        delay = batchPause;
        console.log(`[Campanha #${campaignId}] Lote completo. Pausando ${batchPause / 1000}s.`);
      } else {
        delay = randomInt(minInterval, maxInterval);
        console.log(`[Campanha #${campaignId}] Próximo envio em ${Math.round(delay / 1000)}s.`);
      }

      nextSendTimes.set(campaignId, Date.now() + delay);
      const timer = setTimeout(processNext, delay);
      runningCampaigns.set(campaignId, timer);

    } catch (unexpectedErr) {
      // Qualquer erro não tratado — loga e tenta novamente em 10s
      console.error(`[Campanha #${campaignId}] ERRO INESPERADO:`, unexpectedErr.message, unexpectedErr.stack);
      const timer = setTimeout(processNext, 10000);
      runningCampaigns.set(campaignId, timer);
    }
  }

  console.log(`[Campanha #${campaignId}] Iniciando loop de envio...`);
  processNext();
}

function startCampaign(campaignId) {
  if (runningCampaigns.has(campaignId)) {
    console.log(`[Campanha #${campaignId}] Já está em execução.`);
    return;
  }
  runCampaign(campaignId);
}

function pauseCampaign(campaignId) {
  const timer = runningCampaigns.get(campaignId);
  if (timer) {
    clearTimeout(timer);
    runningCampaigns.delete(campaignId);
    nextSendTimes.delete(campaignId);
    console.log(`[Campanha #${campaignId}] Pausada.`);
  }
}

function resumeCampaign(campaignId) {
  if (!runningCampaigns.has(campaignId)) {
    runCampaign(campaignId);
  }
}

function cancelCampaign(campaignId) {
  pauseCampaign(campaignId);
}

function resumeRunningCampaigns() {
  const running = db.prepare("SELECT id FROM campaigns WHERE status = 'running'").all();
  for (const c of running) {
    console.log(`  Retomando campanha #${c.id}...`);
    startCampaign(c.id);
  }
}

function getNextSendAt(id) { return nextSendTimes.get(id) ?? null; }

module.exports = { startCampaign, pauseCampaign, resumeCampaign, cancelCampaign, resumeRunningCampaigns, getNextSendAt };
