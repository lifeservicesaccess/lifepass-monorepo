const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const VECTOR_FILE = path.join(DATA_DIR, 'embeddings.json');

let pgClient = null;
try {
  const { Client } = require('pg');
  const conn = process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL;
  if (conn) {
    pgClient = new Client({ connectionString: conn });
    pgClient.connect().catch((e) => {
      console.warn('Vector store Postgres connect failed; falling back to file DB:', e.message || e);
      pgClient = null;
    });
  }
} catch (_err) {
  // pg unavailable
}

async function readVectors() {
  try {
    return JSON.parse(await fs.readFile(VECTOR_FILE, 'utf8'));
  } catch (_err) {
    return {};
  }
}

async function writeVectors(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(VECTOR_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function embedText(text) {
  const tokens = normalizeText(text);
  const dims = new Array(16).fill(0);
  for (const token of tokens) {
    let h = 0;
    for (let i = 0; i < token.length; i += 1) h = (h * 31 + token.charCodeAt(i)) >>> 0;
    dims[h % 16] += 1;
  }
  return dims;
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function upsertEmbedding(id, text, metadata = {}) {
  const vector = embedText(text);
  const now = new Date().toISOString();
  if (pgClient) {
    try {
      await pgClient.query(
        `INSERT INTO embeddings (embedding_id,text,vector,metadata,updated_at)
         VALUES ($1,$2,$3::jsonb,$4::jsonb,$5)
         ON CONFLICT (embedding_id) DO UPDATE SET text=$2,vector=$3::jsonb,metadata=$4::jsonb,updated_at=$5`,
        [id, text, JSON.stringify(vector), JSON.stringify(metadata), now]
      );
      return { id, text, vector, metadata, updatedAt: now };
    } catch (e) {
      console.warn('Vector store pg upsert failed; falling back to file DB:', e.message || e);
    }
  }
  const all = await readVectors();
  all[id] = { id, text, vector, metadata, updatedAt: now };
  await writeVectors(all);
  return all[id];
}

async function queryEmbeddings(text, limit = 5) {
  const query = embedText(text);
  if (pgClient) {
    try {
      const res = await pgClient.query('SELECT embedding_id AS id,text,vector,metadata,updated_at AS "updatedAt" FROM embeddings');
      return (res.rows || [])
        .map((r) => ({ ...r, vector: Array.isArray(r.vector) ? r.vector : Object.values(r.vector || {}), score: cosine(query, Array.isArray(r.vector) ? r.vector : Object.values(r.vector || {})) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(1, Number(limit) || 5));
    } catch (e) {
      console.warn('Vector store pg query failed; falling back to file DB:', e.message || e);
    }
  }
  const all = await readVectors();
  return Object.values(all)
    .map((item) => ({ ...item, score: cosine(query, item.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Number(limit) || 5));
}

module.exports = {
  upsertEmbedding,
  queryEmbeddings
};
