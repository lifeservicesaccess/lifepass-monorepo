const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const AUDIT_FILE = path.join(DATA_DIR, 'portal-access-audit.json');

const pgPool = require('./pgPool');

async function readAuditEvents() {
  if (pgPool) {
    try {
      const res = await pgPool.query(
        'SELECT event_id,at,method,path,covenant,policy_key AS "policyKey",decision,status,required_trust AS "requiredTrustLevel",actual_trust AS "actualTrustLevel",user_id AS "userId",reason,trust_score AS "trustScore" FROM portal_access_audit ORDER BY at ASC'
      );
      return res.rows || [];
    } catch (e) {
      console.warn('Portal access audit read failed; falling back to file DB:', e.message || e);
    }
  }
  try {
    const raw = await fs.readFile(AUDIT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

async function appendAuditEvent(event) {
  if (pgPool) {
    try {
      const eventId = event.eventId || crypto.randomUUID();
      await pgPool.query(
        `INSERT INTO portal_access_audit
          (event_id,at,method,path,covenant,policy_key,decision,status,required_trust,actual_trust,user_id,reason,trust_score)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (event_id) DO NOTHING`,
        [
          eventId,
          event.at || new Date().toISOString(),
          event.method || null,
          event.path || null,
          event.covenant || null,
          event.policyKey || null,
          event.decision || null,
          event.status != null ? Number(event.status) : null,
          event.requiredTrustLevel || null,
          event.actualTrustLevel || null,
          event.userId || null,
          event.reason || null,
          event.trustScore != null ? Number(event.trustScore) : null
        ]
      );
      return event;
    } catch (e) {
      console.warn('Portal access audit pg insert failed; falling back to file DB:', e.message || e);
    }
  }
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
