const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const fetch = require('node-fetch');
const db = require('./database');
const runner = require('./campaign-runner');
const { getNextSendAt } = runner;

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── SETTINGS ─────────────────────────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(req.body)) {
    stmt.run(key, String(value ?? ''));
  }
  res.json({ ok: true });
});

// ── TEST CONNECTION ───────────────────────────────────────────────────────────

app.post('/api/test-connection', async (req, res) => {
  try {
    const get = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value || '';
    const baseUrl = get('baseUrl');
    const instanceName = get('instanceName');
    const apiKey = get('apiKey');

    if (!baseUrl || !instanceName) {
      return res.json({ ok: false, message: 'URL base e nome da instância são obrigatórios.' });
    }

    const url = `${baseUrl}/instance/connectionState/${instanceName}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'apikey': apiKey },
      timeout: 10000
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    res.json({ ok: response.ok, status: response.status, data });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ── CONTACTS ──────────────────────────────────────────────────────────────────

function cleanPhone(raw) {
  return String(raw).replace(/[^\d]/g, '');
}

function isValidBrazilianPhone(phone) {
  const cleaned = cleanPhone(phone);
  const local = cleaned.startsWith('55') && cleaned.length > 9 ? cleaned.slice(2) : cleaned;
  return local.length >= 8 && local.length <= 11;
}

app.get('/api/contacts', (req, res) => {
  const { search, tag, group } = req.query;
  let query = 'SELECT * FROM contacts WHERE 1=1';
  const params = [];
  if (search) {
    query += ' AND (name LIKE ? OR phone LIKE ? OR city LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (tag) { query += ' AND tag = ?'; params.push(tag); }
  if (group) { query += ' AND group_name = ?'; params.push(group); }
  query += ' ORDER BY created_at DESC LIMIT 500';
  res.json(db.prepare(query).all(...params));
});

app.get('/api/contacts/meta', (req, res) => {
  const tagRows = db.prepare("SELECT tag, COUNT(*) as count FROM contacts WHERE tag != '' GROUP BY tag ORDER BY tag").all();
  const groupRows = db.prepare("SELECT group_name, COUNT(*) as count FROM contacts WHERE group_name != '' GROUP BY group_name ORDER BY group_name").all();
  const total = db.prepare('SELECT COUNT(*) as c FROM contacts').get().c;
  res.json({
    tags: tagRows.map(r => r.tag),
    groups: groupRows.map(r => r.group_name),
    tagCounts: Object.fromEntries(tagRows.map(r => [r.tag, r.count])),
    groupCounts: Object.fromEntries(groupRows.map(r => [r.group_name, r.count])),
    total
  });
});

app.post('/api/contacts/preview', (req, res) => {
  const { contacts } = req.body;
  const valid = [];
  const invalid = [];
  for (const c of contacts) {
    const phone = cleanPhone(c.phone || c.number || '');
    if (isValidBrazilianPhone(phone)) {
      valid.push({ name: c.name || '', phone, city: c.city || '', tag: c.tag || '', group_name: c.group_name || '', extra_fields: c.extra_fields || {} });
    } else {
      invalid.push({ ...c, phone, reason: phone.length < 2 ? 'Número muito curto' : 'Formato inválido' });
    }
  }
  res.json({ valid, invalid });
});

app.post('/api/contacts', (req, res) => {
  const contacts = req.body;
  const stmt = db.prepare('INSERT INTO contacts (name, phone, city, tag, group_name, extra_fields) VALUES (?, ?, ?, ?, ?, ?)');
  let inserted = 0;
  const errors = [];
  db.exec('BEGIN');
  try {
    for (const c of contacts) {
      const phone = cleanPhone(c.phone || '');
      if (!isValidBrazilianPhone(phone)) {
        errors.push({ phone, reason: 'Número inválido' });
        continue;
      }
      const extras = typeof c.extra_fields === 'object' ? JSON.stringify(c.extra_fields) : '{}';
      stmt.run(c.name || '', phone, c.city || '', c.tag || '', c.group_name || '', extras);
      inserted++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.json({ inserted, errors });
});

const STANDARD_IMPORT_KEYS = new Set(['nome', 'name', 'telefone', 'phone', 'numero', 'number', 'celular', 'whatsapp', 'cidade', 'city', 'tag', 'grupo', 'group']);

app.post('/api/contacts/import', upload.single('file'), (req, res) => {
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (rows.length === 0) return res.json({ contacts: [], total: 0, extraFields: [] });

    const firstRow = rows[0];
    const headers = Object.keys(firstRow).map(k => k.toLowerCase().trim());
    const extraHeaders = headers.filter(h => !STANDARD_IMPORT_KEYS.has(h));

    // Auto-detect phone column — two phases
    const phoneKeys = ['telefone', 'phone', 'numero', 'number', 'celular', 'whatsapp'];
    const hasStdPhone = headers.some(h => phoneKeys.includes(h));
    let autoPhoneKey = null;
    if (!hasStdPhone) {
      const phoneKeywords = ['telefone', 'phone', 'numero', 'number', 'celular', 'whatsapp', 'mobile', 'tel'];
      // Phase 1: header contains phone keyword AND value is numeric
      for (const header of headers) {
        if (phoneKeywords.some(kw => header.includes(kw))) {
          const rawKey = Object.keys(firstRow).find(k => k.toLowerCase().trim() === header);
          if (rawKey && String(firstRow[rawKey]).replace(/[^\d]/g, '').length >= 8) {
            autoPhoneKey = header; break;
          }
        }
      }
      // Phase 2 fallback: any column whose first-row value is numeric
      if (!autoPhoneKey) {
        for (const [key, val] of Object.entries(firstRow)) {
          if (String(val).replace(/[^\d]/g, '').length >= 8) {
            autoPhoneKey = key.toLowerCase().trim(); break;
          }
        }
      }
    }

    const contacts = rows.map(row => {
      const k = {};
      const extras = {};
      for (const [key, val] of Object.entries(row)) {
        const normalized = key.toLowerCase().trim();
        k[normalized] = String(val);
        if (extraHeaders.includes(normalized)) extras[normalized] = String(val);
      }
      const phone = k.telefone || k.phone || k.numero || k.number || k.celular || k.whatsapp || (autoPhoneKey ? k[autoPhoneKey] : '') || '';
      return {
        name: k.nome || k.name || k['given name'] || '',
        phone,
        city: k.cidade || k.city || '',
        tag: k.tag || '',
        group_name: k.grupo || k.group || '',
        extra_fields: extras
      };
    }).filter(c => c.phone.trim() !== '');

    res.json({ contacts, total: contacts.length, extraFields: extraHeaders });
  } catch (err) {
    res.status(400).json({ error: `Erro ao ler arquivo: ${err.message}` });
  }
});

app.delete('/api/contacts/:id', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/contacts/template', (req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['nome', 'telefone', 'cidade', 'tag', 'grupo', 'produto', 'desconto'],
    ['João Silva', '11999887766', 'São Paulo', 'cliente', 'grupo-vip', 'Camiseta Polo', '10%'],
    ['Maria Costa', '21988776655', 'Rio de Janeiro', 'lead', 'grupo-jan', 'Calça Jeans', '20%'],
    ['Pedro Santos', '31977665544', 'Belo Horizonte', 'cliente', '', 'Tênis Running', '15%'],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Contatos');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="modelo-contatos.xlsx"');
  res.send(Buffer.from(buf));
});

app.patch('/api/contacts/group', (req, res) => {
  const { ids, group_name } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'IDs obrigatórios' });
  const stmt = db.prepare('UPDATE contacts SET group_name = ? WHERE id = ?');
  db.exec('BEGIN');
  try {
    for (const id of ids) stmt.run(group_name || '', id);
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }
  res.json({ ok: true, updated: ids.length });
});

app.get('/api/contacts/fields', (req, res) => {
  const { tag, group } = req.query;
  let query = "SELECT extra_fields FROM contacts WHERE extra_fields IS NOT NULL AND extra_fields != '{}'";
  const params = [];
  if (tag) { query += ' AND tag = ?'; params.push(tag); }
  if (group) { query += ' AND group_name = ?'; params.push(group); }
  const rows = db.prepare(query).all(...params);
  const allKeys = new Set();
  for (const row of rows) {
    try {
      const fields = JSON.parse(row.extra_fields || '{}');
      for (const key of Object.keys(fields)) allKeys.add(key);
    } catch {}
  }
  res.json([...allKeys]);
});

app.delete('/api/contacts', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'IDs obrigatórios' });
  const stmt = db.prepare('DELETE FROM contacts WHERE id = ?');
  db.exec('BEGIN');
  try {
    for (const id of ids) stmt.run(id);
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }
  res.json({ ok: true, deleted: ids.length });
});

// ── CAMPAIGNS ─────────────────────────────────────────────────────────────────

app.get('/api/campaigns', (req, res) => {
  res.json(db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all());
});

app.post('/api/campaigns', (req, res) => {
  const { name, message_variants, cadence_config, contact_filter } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'Nome da campanha é obrigatório' });
  if (!Array.isArray(message_variants) || message_variants.length === 0) {
    return res.status(400).json({ error: 'Adicione ao menos uma mensagem' });
  }

  const filter = contact_filter || {};
  let contactIds = [];

  if (filter.all) {
    contactIds = db.prepare('SELECT id FROM contacts').all().map(c => c.id);
  } else if (filter.group) {
    contactIds = db.prepare('SELECT id FROM contacts WHERE group_name = ?').all(filter.group).map(c => c.id);
  } else if (filter.tag) {
    contactIds = db.prepare('SELECT id FROM contacts WHERE tag = ?').all(filter.tag).map(c => c.id);
  } else if (Array.isArray(filter.contactIds) && filter.contactIds.length > 0) {
    contactIds = filter.contactIds.map(Number);
  }

  if (contactIds.length === 0) return res.status(400).json({ error: 'Nenhum contato selecionado' });

  const maxSends = parseInt(cadence_config?.maxSends) || 0;
  const selected = maxSends > 0 ? contactIds.slice(0, maxSends) : contactIds;

  const placeholders = selected.map(() => '?').join(',');
  const contacts = db.prepare(`SELECT * FROM contacts WHERE id IN (${placeholders})`).all(...selected);

  const campaign = db.prepare(
    `INSERT INTO campaigns (name, status, message_variants, cadence_config, contact_filter, total_contacts, sent, failed, pending)
     VALUES (?, 'draft', ?, ?, ?, ?, 0, 0, ?)`
  ).run(name.trim(), JSON.stringify(message_variants), JSON.stringify(cadence_config || {}), JSON.stringify(contact_filter || {}), contacts.length, contacts.length);

  const campaignId = campaign.lastInsertRowid;

  const logStmt = db.prepare(
    "INSERT INTO campaign_logs (campaign_id, contact_id, contact_name, phone, status, attempt_number) VALUES (?, ?, ?, ?, 'pending', 1)"
  );
  db.exec('BEGIN');
  try {
    for (const c of contacts) logStmt.run(campaignId, c.id, c.name, c.phone);
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }

  res.json({ id: campaignId });
});

app.get('/api/campaigns/:id', (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
  res.json(campaign);
});

app.post('/api/campaigns/:id/start', (req, res) => {
  const id = parseInt(req.params.id);
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
  if (!['draft', 'paused'].includes(campaign.status)) {
    return res.status(400).json({ error: `Campanha já está ${campaign.status}` });
  }
  db.prepare("UPDATE campaigns SET status = 'running', started_at = COALESCE(started_at, CURRENT_TIMESTAMP) WHERE id = ?").run(id);
  runner.startCampaign(id);
  res.json({ ok: true });
});

app.post('/api/campaigns/:id/pause', (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare("UPDATE campaigns SET status = 'paused' WHERE id = ?").run(id);
  runner.pauseCampaign(id);
  res.json({ ok: true });
});

app.post('/api/campaigns/:id/resume', (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare("UPDATE campaigns SET status = 'running' WHERE id = ?").run(id);
  runner.resumeCampaign(id);
  res.json({ ok: true });
});

app.post('/api/campaigns/:id/cancel', (req, res) => {
  const id = parseInt(req.params.id);
  runner.cancelCampaign(id);
  db.prepare("UPDATE campaigns SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  db.prepare("UPDATE campaign_logs SET status = 'cancelled' WHERE campaign_id = ? AND status = 'pending'").run(id);
  const cancelled = db.prepare("SELECT COUNT(*) as c FROM campaign_logs WHERE campaign_id = ? AND status = 'cancelled'").get(id).c;
  db.prepare("UPDATE campaigns SET pending = 0 WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.get('/api/campaigns/:id/status', (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });

  const nextPending = db.prepare(
    `SELECT cl.id, cl.contact_name, cl.phone, c.name as db_name
     FROM campaign_logs cl
     LEFT JOIN contacts c ON cl.contact_id = c.id
     WHERE cl.campaign_id = ? AND cl.status = 'pending'
     LIMIT 2`
  ).all(req.params.id);

  const lastSent = db.prepare(
    `SELECT cl.contact_name, cl.phone, cl.message_sent, cl.status, cl.sent_at, c.name as db_name
     FROM campaign_logs cl
     LEFT JOIN contacts c ON cl.contact_id = c.id
     WHERE cl.campaign_id = ? AND cl.status IN ('sent', 'failed')
     ORDER BY cl.id DESC LIMIT 1`
  ).get(req.params.id);

  res.json({ ...campaign, next_pending: nextPending, last_sent: lastSent, next_send_at: getNextSendAt(parseInt(req.params.id)) });
});

app.get('/api/campaigns/:id/logs', (req, res) => {
  const { status, limit = 200, offset = 0 } = req.query;
  let query = 'SELECT * FROM campaign_logs WHERE campaign_id = ?';
  const params = [req.params.id];
  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  res.json(db.prepare(query).all(...params));
});

app.get('/api/campaigns/:id/report', (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });

  const logs = db.prepare('SELECT * FROM campaign_logs WHERE campaign_id = ? ORDER BY sent_at DESC').all(req.params.id);
  const stats = {
    sent: logs.filter(l => l.status === 'sent').length,
    failed: logs.filter(l => l.status === 'failed').length,
    pending: logs.filter(l => l.status === 'pending').length,
    cancelled: logs.filter(l => l.status === 'cancelled').length,
  };
  stats.successRate = (stats.sent + stats.failed) > 0
    ? Math.round((stats.sent / (stats.sent + stats.failed)) * 100)
    : 0;

  res.json({ campaign, logs, stats });
});

app.post('/api/campaigns/:id/duplicate', (req, res) => {
  const orig = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!orig) return res.status(404).json({ error: 'Campanha não encontrada' });

  const newCamp = db.prepare(
    `INSERT INTO campaigns (name, status, message_variants, cadence_config, contact_filter, total_contacts, sent, failed, pending)
     VALUES (?, 'draft', ?, ?, ?, ?, 0, 0, ?)`
  ).run(`${orig.name} (cópia)`, orig.message_variants, orig.cadence_config, orig.contact_filter, orig.total_contacts, orig.total_contacts);

  const origLogs = db.prepare('SELECT * FROM campaign_logs WHERE campaign_id = ?').all(req.params.id);
  const logStmt = db.prepare(
    "INSERT INTO campaign_logs (campaign_id, contact_id, contact_name, phone, status, attempt_number) VALUES (?, ?, ?, ?, 'pending', 1)"
  );
  db.exec('BEGIN');
  try {
    for (const l of origLogs) logStmt.run(newCamp.lastInsertRowid, l.contact_id, l.contact_name, l.phone);
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }

  res.json({ id: newCamp.lastInsertRowid });
});

app.post('/api/campaigns/:id/retry-failed', (req, res) => {
  const orig = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!orig) return res.status(404).json({ error: 'Campanha não encontrada' });

  const failed = db.prepare("SELECT * FROM campaign_logs WHERE campaign_id = ? AND status = 'failed'").all(req.params.id);
  if (failed.length === 0) return res.status(400).json({ error: 'Nenhuma falha encontrada nesta campanha' });

  const newCamp = db.prepare(
    `INSERT INTO campaigns (name, status, message_variants, cadence_config, contact_filter, total_contacts, sent, failed, pending)
     VALUES (?, 'draft', ?, ?, ?, ?, 0, 0, ?)`
  ).run(`${orig.name} (reenvio falhas)`, orig.message_variants, orig.cadence_config, orig.contact_filter, failed.length, failed.length);

  const logStmt = db.prepare(
    "INSERT INTO campaign_logs (campaign_id, contact_id, contact_name, phone, status, attempt_number) VALUES (?, ?, ?, ?, 'pending', ?)"
  );
  db.exec('BEGIN');
  try {
    for (const l of failed) logStmt.run(newCamp.lastInsertRowid, l.contact_id, l.contact_name, l.phone, (l.attempt_number || 1) + 1);
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }

  res.json({ id: newCamp.lastInsertRowid });
});

app.delete('/api/campaigns/:id', (req, res) => {
  const id = req.params.id;
  runner.cancelCampaign(parseInt(id));
  db.prepare('DELETE FROM campaign_logs WHERE campaign_id = ?').run(id);
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ── DASHBOARD ─────────────────────────────────────────────────────────────────

app.get('/api/dashboard', (req, res) => {
  const totalContacts = db.prepare('SELECT COUNT(*) as c FROM contacts').get().c;
  const totalCampaigns = db.prepare('SELECT COUNT(*) as c FROM campaigns').get().c;
  const activeCampaigns = db.prepare("SELECT COUNT(*) as c FROM campaigns WHERE status = 'running'").get().c;
  const totalSent = db.prepare('SELECT COALESCE(SUM(sent),0) as c FROM campaigns').get().c;
  const totalPending = db.prepare("SELECT COALESCE(SUM(pending),0) as c FROM campaigns WHERE status IN ('running','paused')").get().c;
  const totalFailed = db.prepare('SELECT COALESCE(SUM(failed),0) as c FROM campaigns').get().c;
  const processed = totalSent + totalFailed;
  const successRate = processed > 0 ? Math.round((totalSent / processed) * 100) : 0;
  const recentCampaigns = db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 6').all();

  res.json({ totalContacts, totalCampaigns, activeCampaigns, totalSent, totalPending, totalFailed, successRate, recentCampaigns });
});

// ── START ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n========================================');
  console.log('  Disparador Inteligente WhatsApp');
  console.log('========================================');
  console.log(`  Acesse: http://localhost:${PORT}`);
  console.log('========================================\n');
  runner.resumeRunningCampaigns();
});
