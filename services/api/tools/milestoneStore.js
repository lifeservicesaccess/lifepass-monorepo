const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const pgPool = require('./pgPool');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const MILESTONES_FILE = path.join(DATA_DIR, 'milestones.json');

function normalizeStatus(status) {
  const value = String(status || 'pending').trim().toLowerCase();
  if (value === 'pending' || value === 'in_progress' || value === 'completed') return value;
  return 'pending';
}

function normalizeMilestoneInput(input = {}) {
  const title = String(input.title || '').trim();
  if (!title) {
    throw new Error('title is required');
  }

  const status = normalizeStatus(input.status);
  const dueAt = input.dueAt ? new Date(input.dueAt).toISOString() : null;
  const completedAt = status === 'completed'
    ? (input.completedAt ? new Date(input.completedAt).toISOString() : new Date().toISOString())
    : null;

  return {
    title,
    description: String(input.description || '').trim(),
    status,
    dueAt,
    completedAt,
    tags: Array.isArray(input.tags) ? input.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {}
  };
}

async function readFileStore() {
  try {
    const raw = await fs.readFile(MILESTONES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_err) {
    return {};
  }
}

async function writeFileStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(MILESTONES_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function rowToMilestone(row) {
  return {
    id: row.milestone_id,
    userId: row.user_id,
    title: row.title,
    description: row.description || '',
    status: row.status,
    dueAt: row.due_at || null,
    completedAt: row.completed_at || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function computeSummary(milestones = []) {
  const total = milestones.length;
  const completed = milestones.filter((m) => m.status === 'completed').length;
  const inProgress = milestones.filter((m) => m.status === 'in_progress').length;
  const pending = Math.max(0, total - completed - inProgress);
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    pending,
    inProgress,
    completed,
    completionRate
  };
}

function buildBadges(trust, milestones = []) {
  const completed = milestones.filter((m) => m.status === 'completed').length;
  const badges = [];

  if (completed >= 1) badges.push({ code: 'first-step', name: 'First Step', type: 'milestone' });
  if (completed >= 3) badges.push({ code: 'momentum-builder', name: 'Momentum Builder', type: 'milestone' });
  if (completed >= 5) badges.push({ code: 'purpose-runner', name: 'Purpose Runner', type: 'milestone' });

  const trustLevel = String(trust?.level || '').toLowerCase();
  if (trustLevel === 'silver') badges.push({ code: 'silver-steward', name: 'Silver Steward', type: 'trust' });
  if (trustLevel === 'gold') badges.push({ code: 'gold-covenant', name: 'Gold Covenant', type: 'trust' });

  return badges;
}

async function listMilestones(userId) {
  if (pgPool) {
    try {
      const res = await pgPool.query(
        'SELECT milestone_id,user_id,title,description,status,due_at,completed_at,tags,metadata,created_at,updated_at FROM user_milestones WHERE user_id=$1 ORDER BY created_at ASC',
        [userId]
      );
      return (res.rows || []).map(rowToMilestone);
    } catch (err) {
      console.warn('Milestone list from Postgres failed; falling back to file DB:', err.message || err);
    }
  }

  const store = await readFileStore();
  const list = Array.isArray(store[userId]) ? store[userId] : [];
  return list;
}

async function addMilestone(userId, input) {
  const normalized = normalizeMilestoneInput(input);
  const now = new Date().toISOString();
  const milestone = {
    id: input.id || crypto.randomUUID(),
    userId,
    ...normalized,
    createdAt: now,
    updatedAt: now
  };

  if (pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO user_milestones
          (milestone_id,user_id,title,description,status,due_at,completed_at,tags,metadata,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          milestone.id,
          userId,
          milestone.title,
          milestone.description,
          milestone.status,
          milestone.dueAt,
          milestone.completedAt,
          milestone.tags,
          milestone.metadata,
          milestone.createdAt,
          milestone.updatedAt
        ]
      );
      return milestone;
    } catch (err) {
      console.warn('Milestone insert into Postgres failed; falling back to file DB:', err.message || err);
    }
  }

  const store = await readFileStore();
  const list = Array.isArray(store[userId]) ? store[userId] : [];
  list.push(milestone);
  store[userId] = list;
  await writeFileStore(store);
  return milestone;
}

async function updateMilestone(userId, milestoneId, patch = {}) {
  if (!milestoneId) throw new Error('milestoneId is required');

  if (pgPool) {
    try {
      const existingRes = await pgPool.query(
        'SELECT milestone_id,user_id,title,description,status,due_at,completed_at,tags,metadata,created_at,updated_at FROM user_milestones WHERE user_id=$1 AND milestone_id=$2 LIMIT 1',
        [userId, milestoneId]
      );
      if (!existingRes.rows || !existingRes.rows[0]) return null;

      const current = rowToMilestone(existingRes.rows[0]);
      const nextInput = {
        title: patch.title != null ? patch.title : current.title,
        description: patch.description != null ? patch.description : current.description,
        status: patch.status != null ? patch.status : current.status,
        dueAt: patch.dueAt !== undefined ? patch.dueAt : current.dueAt,
        completedAt: patch.completedAt !== undefined ? patch.completedAt : current.completedAt,
        tags: patch.tags !== undefined ? patch.tags : current.tags,
        metadata: patch.metadata !== undefined ? patch.metadata : current.metadata
      };
      const normalized = normalizeMilestoneInput(nextInput);
      const updatedAt = new Date().toISOString();

      await pgPool.query(
        `UPDATE user_milestones
            SET title=$3,description=$4,status=$5,due_at=$6,completed_at=$7,tags=$8,metadata=$9,updated_at=$10
          WHERE user_id=$1 AND milestone_id=$2`,
        [
          userId,
          milestoneId,
          normalized.title,
          normalized.description,
          normalized.status,
          normalized.dueAt,
          normalized.completedAt,
          normalized.tags,
          normalized.metadata,
          updatedAt
        ]
      );

      return {
        id: milestoneId,
        userId,
        ...normalized,
        createdAt: current.createdAt,
        updatedAt
      };
    } catch (err) {
      console.warn('Milestone update in Postgres failed; falling back to file DB:', err.message || err);
    }
  }

  const store = await readFileStore();
  const list = Array.isArray(store[userId]) ? store[userId] : [];
  const idx = list.findIndex((m) => m.id === milestoneId);
  if (idx < 0) return null;

  const current = list[idx];
  const nextInput = {
    title: patch.title != null ? patch.title : current.title,
    description: patch.description != null ? patch.description : current.description,
    status: patch.status != null ? patch.status : current.status,
    dueAt: patch.dueAt !== undefined ? patch.dueAt : current.dueAt,
    completedAt: patch.completedAt !== undefined ? patch.completedAt : current.completedAt,
    tags: patch.tags !== undefined ? patch.tags : current.tags,
    metadata: patch.metadata !== undefined ? patch.metadata : current.metadata
  };
  const normalized = normalizeMilestoneInput(nextInput);
  const updated = {
    ...current,
    ...normalized,
    updatedAt: new Date().toISOString()
  };
  list[idx] = updated;
  store[userId] = list;
  await writeFileStore(store);
  return updated;
}

module.exports = {
  MILESTONES_FILE,
  listMilestones,
  addMilestone,
  updateMilestone,
  computeSummary,
  buildBadges
};
