import { readAdminSessionFromRequest } from '../../../lib/adminSession';

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

function isAllowedPathname(pathname) {
  return pathname === '/health' || pathname.startsWith('/portals/');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const session = readAdminSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Admin session is required' });
  }

  const pathname = String(req.body?.pathname || '').trim();
  const method = String(req.body?.method || 'GET').trim().toUpperCase();
  const body = req.body?.body;

  if (!pathname || !isAllowedPathname(pathname)) {
    return res.status(400).json({ success: false, error: 'Unsupported admin proxy path' });
  }

  const apiBaseUrl = resolveApiBaseUrl();

  try {
    const upstream = await fetch(`${apiBaseUrl}${pathname}`, {
      method,
      headers: buildAdminHeaders(session),
      body: method === 'GET' ? undefined : JSON.stringify(body || {})
    });

    const text = await upstream.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch (_err) {
      payload = { success: false, error: text || 'Admin proxy upstream returned a non-JSON response' };
    }

    return res.status(upstream.status).json(payload);
  } catch (err) {
    return res.status(502).json({
      success: false,
      error: 'Admin proxy failed',
      reason: err.message || String(err)
    });
  }
}