const { Client } = require('pg');
const { loadApiEnv } = require('../tools/loadEnv');

loadApiEnv();

const REQUIRED_TABLES = [
  'profiles',
  'profile_media',
  'verification_events',
  'web_of_trust_edges',
  'trust_events',
  'portal_policy_overrides',
  'portal_policy_snapshots',
  'portal_policy_approvals',
  'portal_policy_admin_audit',
  'portal_access_audit',
  'embeddings',
  'user_milestones'
];

async function main() {
  const connectionString = process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Set PG_CONNECTION_STRING or DATABASE_URL');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const result = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name ASC`,
      [REQUIRED_TABLES]
    );

    const foundTables = new Set((result.rows || []).map((row) => row.table_name));
    const missingTables = REQUIRED_TABLES.filter((tableName) => !foundTables.has(tableName));

    if (missingTables.length > 0) {
      console.error(`Governance schema check failed. Missing tables: ${missingTables.join(', ')}`);
      process.exit(1);
    }

    console.log('Governance schema check passed. Tables present:');
    for (const tableName of REQUIRED_TABLES) {
      console.log(`- ${tableName}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Governance schema check failed:', err.message || err);
  process.exit(1);
});