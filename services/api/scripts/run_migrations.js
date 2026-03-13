const fs = require('fs').promises;
const path = require('path');
const { Client } = require('pg');
const { loadApiEnv } = require('../tools/loadEnv');

loadApiEnv();

async function runMigrations() {
  const conn = process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL;
  if (!conn) {
    console.error('Set PG_CONNECTION_STRING or DATABASE_URL');
    process.exit(1);
  }

  const client = new Client({ connectionString: conn });
  await client.connect();

  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  const entries = await fs.readdir(migrationsDir);
  const files = entries.filter((name) => name.endsWith('.sql')).sort();

  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const sql = await fs.readFile(fullPath, 'utf8');
    process.stdout.write(`Applying ${file}...`);
    await client.query(sql);
    process.stdout.write('done\n');
  }

  await client.end();
  console.log('Migrations complete');
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
