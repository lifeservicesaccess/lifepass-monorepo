const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'verification-events.json');
const EDGES_FILE = path.join(DATA_DIR, 'web-of-trust-edges.json');

const pgPool = require('./pgPool');

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_err) {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function normalizeKind(kind) {
  const normalized = String(kind || '').trim().toLowerCase();
  if (['endorsement', 'document', 'mutual'].includes(normalized)) return normalized;
  return 'endorsement';
}

function normalizeStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (['pending', 'approved', 'rejected', 'revoked'].includes(normalized)) return normalized;
  return 'approved';
}

async function addVerificationEvent(payload) {
  const verificationId = payload.verificationId || crypto.randomUUID();
  const event = {
    verificationId,
    userId: payload.userId,
    verifierUserId: payload.verifierUserId || null,
    verifierName: payload.verifierName || null,
    kind: normalizeKind(payload.kind),
    documentType: payload.documentType || null,
    status: normalizeStatus(payload.status),
    note: payload.note || '',
    evidenceUrl: payload.evidenceUrl || '',
    metadata: payload.metadata || {},
    createdAt: new Date().toISOString(),
    revokedAt: null
  };

  if (pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO verification_events
          (verification_id, user_id, verifier_user_id, verifier_name, kind, document_type, status, note, evidence_url, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
        [
          event.verificationId,
          event.userId,
          event.verifierUserId,
          event.verifierName,
          event.kind,
          event.documentType,
          event.status,
          event.note,
          event.evidenceUrl,
          JSON.stringify(event.metadata || {})
        ]
      );
      return event;
    } catch (e) {
      console.warn('Verification insert failed; falling back to file DB:', e.message || e);
    }
  }

  const all = await readJson(EVENTS_FILE, []);
  all.push(event);
  await writeJson(EVENTS_FILE, all);
  return event;
}

async function revokeVerificationEvent(userId, verificationId, reason = '', reviewerId = '') {
  if (pgPool) {
    try {
      const result = await pgPool.query(
        `UPDATE verification_events
         SET status='revoked', revoked_at=NOW(), note=CASE WHEN note IS NULL OR note='' THEN $3 ELSE note || ' | revoked: ' || $3 END,
             metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
         WHERE user_id=$1 AND verification_id=$2
         RETURNING verification_id AS "verificationId", user_id AS "userId", verifier_user_id AS "verifierUserId", verifier_name AS "verifierName",
                   kind, document_type AS "documentType", status, note, evidence_url AS "evidenceUrl",
                   metadata, created_at AS "createdAt", revoked_at AS "revokedAt"`,
        [userId, verificationId, reason || 'revoked', JSON.stringify({ revokedBy: reviewerId || null })]
      );
      return result.rows[0] || null;
    } catch (e) {
      console.warn('Verification revoke failed; falling back to file DB:', e.message || e);
    }
  }

  const all = await readJson(EVENTS_FILE, []);
  const index = all.findIndex((item) => item.userId === userId && item.verificationId === verificationId);
  if (index < 0) return null;

  const current = all[index];
  all[index] = {
    ...current,
    status: 'revoked',
    revokedAt: new Date().toISOString(),
    note: current.note ? `${current.note} | revoked: ${reason || 'revoked'}` : `revoked: ${reason || 'revoked'}`,
    metadata: {
      ...(current.metadata || {}),
      revokedBy: reviewerId || null
    }
  };
  await writeJson(EVENTS_FILE, all);
  return all[index];
}

async function upsertTrustEdge(edge) {
  const next = {
    edgeId: edge.edgeId || crypto.randomUUID(),
    sourceUserId: edge.sourceUserId,
    targetUserId: edge.targetUserId,
    status: normalizeStatus(edge.status),
    metadata: edge.metadata || {},
    createdAt: new Date().toISOString(),
    revokedAt: null
  };

  if (pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO web_of_trust_edges (edge_id, source_user_id, target_user_id, status, metadata)
         VALUES ($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT (edge_id)
         DO UPDATE SET status=EXCLUDED.status, metadata=EXCLUDED.metadata`,
        [next.edgeId, next.sourceUserId, next.targetUserId, next.status, JSON.stringify(next.metadata || {})]
      );
      return next;
    } catch (e) {
      console.warn('Web-of-trust upsert failed; falling back to file DB:', e.message || e);
    }
  }

  const all = await readJson(EDGES_FILE, []);
  const index = all.findIndex((item) => item.edgeId === next.edgeId);
  if (index >= 0) {
    all[index] = { ...all[index], ...next };
  } else {
    all.push(next);
  }
  await writeJson(EDGES_FILE, all);
  return next;
}

async function listVerificationEvents(userId, opts = {}) {
  const includeRevoked = Boolean(opts.includeRevoked);

  if (pgPool) {
    try {
      const clauses = ['user_id=$1'];
      const params = [userId];
      if (!includeRevoked) clauses.push(`status <> 'revoked'`);
      const result = await pgPool.query(
        `SELECT verification_id AS "verificationId", user_id AS "userId", verifier_user_id AS "verifierUserId", verifier_name AS "verifierName",
                kind, document_type AS "documentType", status, note, evidence_url AS "evidenceUrl", metadata,
                created_at AS "createdAt", revoked_at AS "revokedAt"
         FROM verification_events
         WHERE ${clauses.join(' AND ')}
         ORDER BY created_at ASC`,
        params
      );
      return result.rows || [];
    } catch (e) {
      console.warn('Verification list failed; falling back to file DB:', e.message || e);
    }
  }

  const all = await readJson(EVENTS_FILE, []);
  return all.filter((item) => item.userId === userId && (includeRevoked || item.status !== 'revoked'));
}

async function listTrustEdgesByTarget(userId, opts = {}) {
  const includeRevoked = Boolean(opts.includeRevoked);

  if (pgPool) {
    try {
      const clauses = ['target_user_id=$1'];
      const params = [userId];
      if (!includeRevoked) clauses.push(`status <> 'revoked'`);
      const result = await pgPool.query(
        `SELECT edge_id AS "edgeId", source_user_id AS "sourceUserId", target_user_id AS "targetUserId", status,
                metadata, created_at AS "createdAt", revoked_at AS "revokedAt"
         FROM web_of_trust_edges
         WHERE ${clauses.join(' AND ')}
         ORDER BY created_at ASC`,
        params
      );
      return result.rows || [];
    } catch (e) {
      console.warn('Web-of-trust list failed; falling back to file DB:', e.message || e);
    }
  }

  const all = await readJson(EDGES_FILE, []);
  return all.filter((item) => item.targetUserId === userId && (includeRevoked || item.status !== 'revoked'));
}

async function getVerificationSummary(userId) {
  const events = await listVerificationEvents(userId, { includeRevoked: false });
  const edges = await listTrustEdgesByTarget(userId, { includeRevoked: false });

  const approvedEvents = events.filter((item) => item.status === 'approved');
  const rejectedEvents = events.filter((item) => item.status === 'rejected');
  const approvedEndorsements = approvedEvents.filter((item) => item.kind === 'endorsement').length;
  const approvedDocumentChecks = approvedEvents.filter((item) => item.kind === 'document').length;
  const approvedMutualVerifications = approvedEvents.filter((item) => item.kind === 'mutual').length;
  const rejectedDocumentChecks = rejectedEvents.filter((item) => item.kind === 'document').length;

  return {
    totalEvents: events.length,
    approvedEndorsements,
    approvedDocumentChecks,
    approvedMutualVerifications,
    rejectedDocumentChecks,
    graphEdgesCount: edges.length,
    events,
    edges
  };
}

module.exports = {
  addVerificationEvent,
  revokeVerificationEvent,
  upsertTrustEdge,
  listVerificationEvents,
  listTrustEdgesByTarget,
  getVerificationSummary
};
