const { Client } = require('pg');
const profileDb = require('../tools/profileDb');
const { loadApiEnv } = require('../tools/loadEnv');

loadApiEnv();

const seedData = {
  "user-123": { userId: "user-123", name: "Alice Example", dob: "2000-01-01", email: "alice@example.com" },
  "user-456": { userId: "user-456", name: "Bob Example", dob: "1995-05-05", email: "bob@example.com" }
};

async function seed() {
  const conn = process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL;
  if (!conn) {
    for (const [userId, profile] of Object.entries(seedData)) {
      await profileDb.upsertProfile(userId, profile);
      console.log('Seeded profile (file fallback):', userId);
    }
    return;
  }
  const client = new Client({ connectionString: conn });
  await client.connect();
  for (const [userId, profile] of Object.entries(seedData)) {
    await client.query('INSERT INTO profiles (user_id, data) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET data = $2', [userId, profile]);
    console.log('Seeded profile:', userId);
  }
  await client.end();
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });