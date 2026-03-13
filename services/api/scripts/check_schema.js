const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'db', 'migrations', '001_sprint1_identity.sql');

function mustContain(source, token) {
  if (!source.includes(token)) {
    throw new Error(`Schema check failed: missing token: ${token}`);
  }
}

function run() {
  const sql = fs.readFileSync(filePath, 'utf8');

  mustContain(sql, 'CREATE TABLE IF NOT EXISTS profiles');
  mustContain(sql, 'CREATE TABLE IF NOT EXISTS profile_media');
  mustContain(sql, 'CREATE TABLE IF NOT EXISTS verification_events');
  mustContain(sql, 'CREATE TABLE IF NOT EXISTS web_of_trust_edges');
  mustContain(sql, 'CREATE TABLE IF NOT EXISTS trust_events');

  console.log('Schema check passed:', filePath);
}

try {
  run();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
