CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profile_media (
  media_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  storage_provider TEXT NOT NULL,
  bucket TEXT,
  object_key TEXT,
  public_url TEXT,
  checksum_sha256 TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_media_user ON profile_media(user_id);

CREATE TABLE IF NOT EXISTS verification_events (
  verification_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  verifier_user_id TEXT,
  verifier_name TEXT,
  kind TEXT NOT NULL,
  document_type TEXT,
  status TEXT NOT NULL,
  note TEXT,
  evidence_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_verification_events_user ON verification_events(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_events_kind ON verification_events(kind);

CREATE TABLE IF NOT EXISTS web_of_trust_edges (
  edge_id TEXT PRIMARY KEY,
  source_user_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wot_target ON web_of_trust_edges(target_user_id);

CREATE TABLE IF NOT EXISTS trust_events (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  from_score INTEGER,
  to_score INTEGER NOT NULL,
  from_level TEXT,
  to_level TEXT NOT NULL,
  reason TEXT NOT NULL,
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  policy_version TEXT NOT NULL DEFAULT 'v2',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trust_events_user ON trust_events(user_id);
