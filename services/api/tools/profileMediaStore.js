const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const MEDIA_FILE = path.join(DATA_DIR, 'profile-media.json');

let pgClient = null;
try {
  const { Client } = require('pg');
  const conn = process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL;
  if (conn) {
    pgClient = new Client({ connectionString: conn });
    pgClient.connect().catch((e) => {
      console.warn('Profile media Postgres connect failed; falling back to file DB:', e.message || e);
      pgClient = null;
    });
  }
} catch (_err) {
  // pg unavailable; file fallback will be used
}

async function readMedia() {
  try {
    const raw = await fs.readFile(MEDIA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (_err) {
    return [];
  }
}

async function writeMedia(items) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(MEDIA_FILE, JSON.stringify(items, null, 2), 'utf8');
}

async function addMediaRecord(record) {
  const next = {
    mediaId: record.mediaId,
    userId: record.userId,
    mediaType: record.mediaType,
    storageProvider: record.storageProvider,
    bucket: record.bucket || null,
    objectKey: record.objectKey || null,
    publicUrl: record.publicUrl || null,
    checksumSha256: record.checksumSha256 || null,
    metadata: record.metadata || {},
    uploadedAt: record.uploadedAt || new Date().toISOString()
  };

  if (pgClient) {
    try {
      await pgClient.query(
        `INSERT INTO profile_media
          (media_id, user_id, media_type, storage_provider, bucket, object_key, public_url, checksum_sha256, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
         ON CONFLICT (media_id) DO UPDATE
         SET public_url=EXCLUDED.public_url, checksum_sha256=EXCLUDED.checksum_sha256, metadata=EXCLUDED.metadata`,
        [
          next.mediaId,
          next.userId,
          next.mediaType,
          next.storageProvider,
          next.bucket,
          next.objectKey,
          next.publicUrl,
          next.checksumSha256,
          JSON.stringify(next.metadata || {})
        ]
      );
      return next;
    } catch (e) {
      console.warn('Profile media insert failed; falling back to file DB:', e.message || e);
    }
  }

  const all = await readMedia();
  all.push(next);
  await writeMedia(all);
  return next;
}

async function listMediaByUser(userId) {
  if (pgClient) {
    try {
      const result = await pgClient.query(
        `SELECT media_id AS "mediaId", user_id AS "userId", media_type AS "mediaType", storage_provider AS "storageProvider",
                bucket, object_key AS "objectKey", public_url AS "publicUrl", checksum_sha256 AS "checksumSha256",
                metadata, uploaded_at AS "uploadedAt"
         FROM profile_media
         WHERE user_id=$1
         ORDER BY uploaded_at DESC`,
        [userId]
      );
      return result.rows || [];
    } catch (e) {
      console.warn('Profile media list failed; falling back to file DB:', e.message || e);
    }
  }

  const all = await readMedia();
  return all.filter((item) => item.userId === userId);
}

module.exports = {
  addMediaRecord,
  listMediaByUser
};
