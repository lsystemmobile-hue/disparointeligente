const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'data.db'));

db.exec("PRAGMA journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT DEFAULT '',
    phone TEXT NOT NULL,
    city TEXT DEFAULT '',
    tag TEXT DEFAULT '',
    group_name TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    message_variants TEXT DEFAULT '[]',
    cadence_config TEXT DEFAULT '{}',
    contact_filter TEXT DEFAULT '{}',
    total_contacts INTEGER DEFAULT 0,
    sent INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    pending INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS campaign_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    contact_id INTEGER,
    contact_name TEXT DEFAULT '',
    phone TEXT NOT NULL,
    message_sent TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    api_response TEXT DEFAULT '',
    error_reason TEXT DEFAULT '',
    attempt_number INTEGER DEFAULT 1,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
  );
`);

const defaultSettings = [
  ['baseUrl', ''],
  ['instanceName', ''],
  ['apiKey', ''],
  ['allowedHourStart', '8'],
  ['allowedHourEnd', '20'],
];

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of defaultSettings) {
  insertSetting.run(key, value);
}

// Migration: add extra_fields column if not exists
try { db.exec("ALTER TABLE contacts ADD COLUMN extra_fields TEXT DEFAULT '{}'"); } catch(e) {}

module.exports = db;
