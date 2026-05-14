import {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  isAdminSessionConfigured
} from '../../../lib/adminSession';

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) return '';
  return String(baseUrl).replace(/\/$/, '');
}

function resolveApiBaseUrl() {
  return normalizeBaseUrl(
    process.env.API_BASE_URL
    || process.env.NEXT_PUBLIC_API_BASE_URL
    || process.env.LOCAL_API_BASE_URL
    || 'http://localhost:3003'
  );
}

function buildAdminHeaders(session) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': String(session.apiKey || '').trim()
  };

  if (session.adminMode === 'jwt') {
    headers.Authorization = `Bearer ${String(session.adminCredential || '').trim()}`;
    return headers;
  }

  headers['x-policy-admin-key'] = String(session.adminCredential || '').trim();
  if (session.adminKeyId) headers['x-policy-admin-key-id'] = String(session.adminKeyId).trim();
  if (session.adminActor) headers['x-admin-actor'] = String(session.adminActor).trim();
  return headers;
}

async function validateAdminSession(candidate) {
  const apiBaseUrl = resolveApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/portals/policy-snapshots?limit=1`, {
    method: 'GET',
    headers: buildAdminHeaders(candidate)
  });

  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_err) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || 'Admin credential validation failed');
  }
}

export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearAdminSessionCookie());
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!isAdminSessionConfigured()) {
    return res.status(500).json({
      success: false,
      error: 'ADMIN_CONSOLE_SESSION_SECRET is not configured'
    });
  }

  const apiKey = String(req.body?.apiKey || '').trim();
  const adminMode = String(req.body?.adminMode || '').trim();
  const adminCredential = String(req.body?.adminCredential || '').trim();
  const adminKeyId = String(req.body?.adminKeyId || '').trim();
  const adminActor = String(req.body?.adminActor || '').trim();

  if (!apiKey || !adminCredential || (adminMode !== 'key' && adminMode !== 'jwt')) {
    return res.status(400).json({ success: false, error: 'API key, admin mode, and credential are required' });
  }

  const sessionPayload = {
    apiKey,
    adminMode,
    adminCredential,
    adminKeyId,
    adminActor
  };

  try {
    await validateAdminSession(sessionPayload);
    res.setHeader('Set-Cookie', createAdminSessionCookie(sessionPayload));
    return res.status(200).json({
      success: true,
      session: {
        adminMode,
        actor: adminMode === 'jwt' ? (adminActor || 'jwt-actor') : (adminActor || `key:${adminKeyId || 'legacy'}`)
      }
    });
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: err.message || 'Admin credential validation failed'
    });
  }
}