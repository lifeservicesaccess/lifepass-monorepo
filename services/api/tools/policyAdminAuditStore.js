const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const POLICY_ADMIN_AUDIT_FILE = path.join(DATA_DIR, 'portal-policy-admin-audit.json');

const pgPool = require('./pgPool');
const { handleGovernanceFallback } = require('./governanceMode');

async function readPolicyAdminAuditEvents() {
  if (pgPool) {
    try {
      const res = await pgPool.query('SELECT event_id,at,actor,action,payload FROM portal_policy_admin_audit ORDER BY at ASC');
      return (res.rows || []).map((r) => ({ ...r.payload, at: r.at, actor: r.actor, action: r.action }));
    } catch (e) {
      handleGovernanceFallback('Policy admin audit read failed', e);
    }
  }
  try {
    const raw = await fs.readFile(POLICY_ADMIN_AUDIT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

async function appendPolicyAdminAuditEvent(event) {
  if (pgPool) {
    try {
      const eventId = event.eventId || crypto.randomUUID();
      await pgPool.query(
        'INSERT INTO portal_policy_admin_audit (event_id,at,actor,action,payload) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (event_id) DO NOTHING',
        [eventId, event.at || new Date().toISOString(), event.actor || 'unknown', event.action || 'unknown', JSON.stringify(event)]
      );
      return event;
    } catch (e) {
      handleGovernanceFallback('Policy admin audit pg insert failed', e);
    }
  }
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
