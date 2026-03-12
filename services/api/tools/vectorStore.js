const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const VECTOR_FILE = path.join(DATA_DIR, 'embeddings.json');

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
  const all = await readVectors();
  all[id] = {
    id,
    text,
    vector: embedText(text),
    metadata,
    updatedAt: new Date().toISOString()
  };
  await writeVectors(all);
  return all[id];
}

async function queryEmbeddings(text, limit = 5) {
  const all = await readVectors();
  const query = embedText(text);
  return Object.values(all)
    .map((item) => ({ ...item, score: cosine(query, item.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Number(limit) || 5));
}

module.exports = {
  upsertEmbedding,
  queryEmbeddings
};
