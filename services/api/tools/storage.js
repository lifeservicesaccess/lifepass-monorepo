const crypto = require('crypto');

function sanitizeName(value) {
  return String(value || 'upload.bin')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-');
}

function inferProvider() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_STORAGE_BUCKET) {
    return 'supabase';
  }
  if (process.env.S3_BUCKET && process.env.S3_REGION) {
    return 's3';
  }
  return 'local';
}

async function createSupabaseUploadIntent({ userId, fileName, contentType, mediaType }) {
  const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  const token = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const uploadId = crypto.randomUUID();
  const objectKey = `${mediaType}/${userId}/${uploadId}-${sanitizeName(fileName)}`;

  const endpoint = `${baseUrl}/storage/v1/object/upload/sign/${bucket}/${objectKey}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: token,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ upsert: false, contentType: contentType || 'application/octet-stream' })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase upload intent failed: ${errorText}`);
  }

  const payload = await response.json();
  const signedPath = payload?.signedURL || payload?.signedUrl;
  if (!signedPath) {
    throw new Error('Supabase upload intent response missing signed URL');
  }

  return {
    uploadId,
    provider: 'supabase',
    bucket,
    objectKey,
    uploadUrl: `${baseUrl}/storage/v1${signedPath}`,
    fileUrl: `${baseUrl}/storage/v1/object/public/${bucket}/${objectKey}`,
    expiresIn: payload?.token ? 3600 : 0
  };
}

function createS3UploadIntent({ userId, fileName, mediaType }) {
  const uploadId = crypto.randomUUID();
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;
  const objectKey = `${mediaType}/${userId}/${uploadId}-${sanitizeName(fileName)}`;

  return {
    uploadId,
    provider: 's3',
    bucket,
    objectKey,
    uploadUrl: null,
    fileUrl: `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}`,
    expiresIn: 0,
    message: 'S3 configured without presign support in API. Use your uploader service to sign PUT URL.'
  };
}

function createLocalUploadIntent({ userId, fileName, mediaType }) {
  const uploadId = crypto.randomUUID();
  const objectKey = `${mediaType}/${userId}/${uploadId}-${sanitizeName(fileName)}`;
  return {
    uploadId,
    provider: 'local',
    bucket: 'local-uploads',
    objectKey,
    uploadUrl: null,
    fileUrl: `/uploads/${objectKey}`,
    expiresIn: 0,
    message: 'Storage provider not configured. Reference-only mode is active.'
  };
}

async function createUploadIntent({ userId, fileName, contentType, mediaType = 'biometric-photo' }) {
  const provider = inferProvider();

  if (provider === 'supabase') {
    return createSupabaseUploadIntent({ userId, fileName, contentType, mediaType });
  }

  if (provider === 's3') {
    return createS3UploadIntent({ userId, fileName, mediaType });
  }

  return createLocalUploadIntent({ userId, fileName, mediaType });
}

module.exports = {
  createUploadIntent,
  inferProvider
};
