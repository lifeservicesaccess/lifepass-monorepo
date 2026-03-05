const { Client } = require('pg');

async function migrate() {
  const conn = process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL;
  if (!conn) {
    console.error('Set PG_CONNECTION_STRING or DATABASE_URL');
    process.exit(1);
  }
  const client = new Client({ connectionString: conn });
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id VARCHAR PRIMARY KEY,
      data JSONB NOT NULL
    );
  `);
  console.log('Profiles table migrated');
  await client.end();
}

migrate().catch(err => { console.error('Migration failed:', err); process.exit(1); });