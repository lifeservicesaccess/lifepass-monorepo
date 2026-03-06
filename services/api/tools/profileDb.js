// Profile DB adapter with Postgres support and JSON-file fallback
const fs = require('fs').promises;
const path = require('path');
let pgClient = null;
try {
  const { Client } = require('pg');
  const conn = process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL;
  if (conn) {
    pgClient = new Client({ connectionString: conn });
    pgClient.connect().catch((e) => {
      console.warn('Postgres connect failed, falling back to file DB:', e.message || e);
      pgClient = null;
    });
  }
} catch (e) {
  // pg not installed or not configured; will use file fallback
}

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');

async function _readProfilesFile() {
  try {
    const raw = await fs.readFile(PROFILES_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

async function getProfile(userId) {
  if (pgClient) {
    try {
      const res = await pgClient.query('SELECT data FROM profiles WHERE user_id=$1 LIMIT 1', [userId]);
      if (res.rows && res.rows.length) return res.rows[0].data;
      return null;
    } catch (e) {
      console.warn('Postgres query failed, falling back to file DB:', e.message || e);
    }
  }

  // File fallback
  await fs.mkdir(DATA_DIR, { recursive: true });
  const profiles = await _readProfilesFile();
  return profiles[userId] || null;
}

async function upsertProfile(userId, profile) {
  if (pgClient) {
    try {
      await pgClient.query('INSERT INTO profiles (user_id, data) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET data = $2', [userId, profile]);
      return true;
    } catch (e) {
      console.warn('Postgres upsert failed, falling back to file DB:', e.message || e);
    }
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  const profiles = await _readProfilesFile();
  profiles[userId] = profile;
  await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf8');
  return true;
}

module.exports = { getProfile, upsertProfile };
