const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const POLICY_SNAPSHOT_FILE = path.join(DATA_DIR, 'portal-policy-snapshots.json');

let pgClient = null;
try {
  const { Client } = require('pg');
  const conn = process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL;
  if (conn) {
    pgClient = new Client({ connectionString: conn });
    pgClient.connect().catch((e) => {
      console.warn('Policy snapshot Postgres connect failed; falling back to file DB:', e.message || e);
      pgClient = null;
    });
  }
} catch (_err) {
  // pg unavailable
}

async function readPolicySnapshots() {
  if (pgClient) {
    try {
      const res = await pgClient.query('SELECT snapshot_id AS id,at,actor,reason,replace,overrides,changes FROM portal_policy_snapshots ORDER BY at ASC');
      return res.rows || [];
    } catch (e) {
      console.warn('Policy snapshot read failed; falling back to file DB:', e.message || e);
    }
  }
  try {
    const raw = await fs.readFile(POLICY_SNAPSHOT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

async function appendPolicySnapshot(snapshot) {
  if (pgClient) {
    try {
      await pgClient.query(
        'INSERT INTO portal_policy_snapshots (snapshot_id,at,actor,reason,replace,overrides,changes) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) ON CONFLICT (snapshot_id) DO NOTHING',
        [snapshot.id, snapshot.at || new Date().toISOString(), snapshot.actor || 'unknown', snapshot.reason || '', Boolean(snapshot.replace), JSON.stringify(snapshot.overrides || {}), JSON.stringify(snapshot.changes || [])]
      );
      return snapshot;
    } catch (e) {
      console.warn('Policy snapshot pg insert failed; falling back to file DB:', e.message || e);
    }
  }
  const all = await readPolicySnapshots();
  all.push(snapshot);
  const maxRows = Math.max(100, Number(process.env.POLICY_SNAPSHOT_MAX_ROWS) || 500);
  const trimmed = all.slice(-maxRows);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(POLICY_SNAPSHOT_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  return snapshot;
}

async function findPolicySnapshot(snapshotId) {
  if (pgClient) {
    try {
      const res = await pgClient.query('SELECT snapshot_id AS id,at,actor,reason,replace,overrides,changes FROM portal_policy_snapshots WHERE snapshot_id=$1 LIMIT 1', [snapshotId]);
      return (res.rows && res.rows[0]) || null;
    } catch (e) {
      console.warn('Policy snapshot find failed; falling back to file DB:', e.message || e);
    }
  }
  const all = await readPolicySnapshots();
  return all.find((item) => String(item.id) === String(snapshotId)) || null;
}

module.exports = {
  POLICY_SNAPSHOT_FILE,
  readPolicySnapshots,
  appendPolicySnapshot,
  findPolicySnapshot
};
