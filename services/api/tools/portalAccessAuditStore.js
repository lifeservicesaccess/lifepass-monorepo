const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const AUDIT_FILE = path.join(DATA_DIR, 'portal-access-audit.json');

async function readAuditEvents() {
  try {
    const raw = await fs.readFile(AUDIT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

async function appendAuditEvent(event) {
  const all = await readAuditEvents();
  all.push(event);
  const maxRows = Math.max(200, Number(process.env.PORTAL_ACCESS_AUDIT_MAX_ROWS) || 2000);
  const trimmed = all.slice(-maxRows);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(AUDIT_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  return event;
}

module.exports = {
  readAuditEvents,
  appendAuditEvent,
  AUDIT_FILE
};
