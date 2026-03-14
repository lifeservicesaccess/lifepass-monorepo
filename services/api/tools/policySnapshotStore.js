const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const POLICY_SNAPSHOT_FILE = path.join(DATA_DIR, 'portal-policy-snapshots.json');

async function readPolicySnapshots() {
  try {
    const raw = await fs.readFile(POLICY_SNAPSHOT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

async function appendPolicySnapshot(snapshot) {
  const all = await readPolicySnapshots();
  all.push(snapshot);
  const maxRows = Math.max(100, Number(process.env.POLICY_SNAPSHOT_MAX_ROWS) || 500);
  const trimmed = all.slice(-maxRows);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(POLICY_SNAPSHOT_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  return snapshot;
}

async function findPolicySnapshot(snapshotId) {
  const all = await readPolicySnapshots();
  return all.find((item) => String(item.id) === String(snapshotId)) || null;
}

module.exports = {
  POLICY_SNAPSHOT_FILE,
  readPolicySnapshots,
  appendPolicySnapshot,
  findPolicySnapshot
};
