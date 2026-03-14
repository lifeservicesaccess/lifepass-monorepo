const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const POLICY_ADMIN_AUDIT_FILE = path.join(DATA_DIR, 'portal-policy-admin-audit.json');

async function readPolicyAdminAuditEvents() {
  try {
    const raw = await fs.readFile(POLICY_ADMIN_AUDIT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

async function appendPolicyAdminAuditEvent(event) {
  const all = await readPolicyAdminAuditEvents();
  all.push(event);
  const maxRows = Math.max(200, Number(process.env.POLICY_ADMIN_AUDIT_MAX_ROWS) || 2000);
  const trimmed = all.slice(-maxRows);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(POLICY_ADMIN_AUDIT_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  return event;
}

module.exports = {
  POLICY_ADMIN_AUDIT_FILE,
  readPolicyAdminAuditEvents,
  appendPolicyAdminAuditEvent
};
