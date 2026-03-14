-- Portal policy override matrix (single-row config; upserted by key 'default')
CREATE TABLE IF NOT EXISTS portal_policy_overrides (
  config_key   TEXT PRIMARY KEY DEFAULT 'default',
  matrix       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Policy change snapshots (append-only history of matrix updates/restores)
CREATE TABLE IF NOT EXISTS portal_policy_snapshots (
  snapshot_id  TEXT PRIMARY KEY,
  at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor        TEXT NOT NULL,
  reason       TEXT NOT NULL DEFAULT '',
  replace      BOOLEAN NOT NULL DEFAULT FALSE,
  overrides    JSONB NOT NULL DEFAULT '{}'::jsonb,
  changes      JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_policy_snapshots_at ON portal_policy_snapshots(at DESC);

-- Two-person policy approval proposals
CREATE TABLE IF NOT EXISTS portal_policy_approvals (
  proposal_id        TEXT PRIMARY KEY,
  at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor              TEXT NOT NULL,
  action             TEXT NOT NULL,
  reason             TEXT NOT NULL DEFAULT '',
  payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_hash       TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending',
  required_approvals INTEGER NOT NULL DEFAULT 2,
  approvals          JSONB NOT NULL DEFAULT '[]'::jsonb,
  executed_at        TIMESTAMPTZ,
  execution          JSONB
);

CREATE INDEX IF NOT EXISTS idx_policy_approvals_status ON portal_policy_approvals(status);

-- Policy admin audit log (admin actions: update, restore, propose, approve, execute)
CREATE TABLE IF NOT EXISTS portal_policy_admin_audit (
  event_id   TEXT PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_policy_admin_audit_at ON portal_policy_admin_audit(at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_admin_audit_actor ON portal_policy_admin_audit(actor);

-- Portal access audit log (every covenant policy evaluation)
CREATE TABLE IF NOT EXISTS portal_access_audit (
  event_id          TEXT PRIMARY KEY,
  at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method            TEXT,
  path              TEXT,
  covenant          TEXT,
  policy_key        TEXT,
  decision          TEXT,
  status            INTEGER,
  required_trust    TEXT,
  actual_trust      TEXT,
  user_id           TEXT,
  reason            TEXT,
  trust_score       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_portal_access_audit_at      ON portal_access_audit(at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_access_audit_user    ON portal_access_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_portal_access_audit_cov     ON portal_access_audit(covenant);
CREATE INDEX IF NOT EXISTS idx_portal_access_audit_dec     ON portal_access_audit(decision);

-- Embeddings / vector search (bag-of-words cosine via stored vector array)
CREATE TABLE IF NOT EXISTS embeddings (
  embedding_id  TEXT PRIMARY KEY,
  text          TEXT NOT NULL,
  vector        JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
