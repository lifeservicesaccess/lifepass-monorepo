const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const POLICY_APPROVAL_FILE = path.join(DATA_DIR, 'portal-policy-approvals.json');

const pgPool = require('./pgPool');

function rowToProposal(row) {
  return {
    id: row.proposal_id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    reason: row.reason,
    payload: row.payload,
    payloadHash: row.payload_hash,
    status: row.status,
    requiredApprovals: row.required_approvals,
    approvals: row.approvals,
    executedAt: row.executed_at || null,
    execution: row.execution || null
  };
}

async function readPolicyApprovals() {
  if (pgPool) {
    try {
      const res = await pgPool.query('SELECT * FROM portal_policy_approvals ORDER BY at ASC');
      return (res.rows || []).map(rowToProposal);
    } catch (e) {
      console.warn('Policy approval read failed; falling back to file DB:', e.message || e);
    }
  }
  try {
    const raw = await fs.readFile(POLICY_APPROVAL_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

async function writePolicyApprovals(items) {
  const maxRows = Math.max(200, Number(process.env.POLICY_APPROVAL_MAX_ROWS) || 2000);
  const trimmed = (Array.isArray(items) ? items : []).slice(-maxRows);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(POLICY_APPROVAL_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  return trimmed;
}

async function appendPolicyApproval(item) {
  if (pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO portal_policy_approvals
          (proposal_id,at,actor,action,reason,payload,payload_hash,status,required_approvals,approvals)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb)
         ON CONFLICT (proposal_id) DO NOTHING`,
        [item.id, item.at || new Date().toISOString(), item.actor, item.action, item.reason || '', JSON.stringify(item.payload || {}), item.payloadHash || '', item.status || 'pending', item.requiredApprovals || 2, JSON.stringify(item.approvals || [])]
      );
      return item;
    } catch (e) {
      console.warn('Policy approval pg insert failed; falling back to file DB:', e.message || e);
    }
  }
  const all = await readPolicyApprovals();
  all.push(item);
  await writePolicyApprovals(all);
  return item;
}

async function findPolicyApprovalById(id) {
  if (pgPool) {
    try {
      const res = await pgPool.query('SELECT * FROM portal_policy_approvals WHERE proposal_id=$1 LIMIT 1', [id]);
      return (res.rows && res.rows[0]) ? rowToProposal(res.rows[0]) : null;
    } catch (e) {
      console.warn('Policy approval find failed; falling back to file DB:', e.message || e);
    }
  }
  const all = await readPolicyApprovals();
  return all.find((item) => String(item.id) === String(id)) || null;
}

async function updatePolicyApproval(id, updater) {
  if (pgPool) {
    try {
      const current = await findPolicyApprovalById(id);
      if (!current) return null;
      const next = typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) };
      await pgPool.query(
        `UPDATE portal_policy_approvals SET
          status=$2, approvals=$3::jsonb, executed_at=$4, execution=$5::jsonb
         WHERE proposal_id=$1`,
        [id, next.status || 'pending', JSON.stringify(next.approvals || []), next.executedAt || null, next.execution ? JSON.stringify(next.execution) : null]
      );
      return next;
    } catch (e) {
      console.warn('Policy approval pg update failed; falling back to file DB:', e.message || e);
    }
  }
  const all = await readPolicyApprovals();
  const index = all.findIndex((item) => String(item.id) === String(id));
  if (index < 0) return null;
  const current = all[index];
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) };
  all[index] = next;
  await writePolicyApprovals(all);
  return next;
}

module.exports = {
  POLICY_APPROVAL_FILE,
  readPolicyApprovals,
  writePolicyApprovals,
  appendPolicyApproval,
  findPolicyApprovalById,
  updatePolicyApproval
};
