// Shared pg connection Pool — imported by all data store modules.
// A single Pool is created per process, with up to 10 concurrent connections.
// Returns null if no DATABASE_URL / PG_CONNECTION_STRING is configured,
// in which case every store falls back to its local JSON file.
let pool = null;

try {
  const { Pool } = require('pg');
  const conn = process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL;
  if (conn) {
    pool = new Pool({ connectionString: conn, max: 10 });
    pool.on('error', (err) => {
      console.warn('[pgPool] unexpected error on idle client:', err.message || err);
    });
  }
} catch (_err) {
  // pg not installed — all stores will use their file fallbacks
}

module.exports = pool;
