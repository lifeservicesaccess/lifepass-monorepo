const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const POLICY_APPROVAL_FILE = path.join(DATA_DIR, 'portal-policy-approvals.json');

async function readPolicyApprovals() {
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
  const all = await readPolicyApprovals();
  all.push(item);
  await writePolicyApprovals(all);
  return item;
}

async function findPolicyApprovalById(id) {
  const all = await readPolicyApprovals();
  return all.find((item) => String(item.id) === String(id)) || null;
}

async function updatePolicyApproval(id, updater) {
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
