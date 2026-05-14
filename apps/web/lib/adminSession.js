import crypto from 'node:crypto';

const ADMIN_SESSION_COOKIE = 'lifepass_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 4;

function resolveSessionSecret() {
  return String(process.env.ADMIN_CONSOLE_SESSION_SECRET || '').trim();
}

function getSessionKey() {
  const secret = resolveSessionSecret();
  if (!secret) return null;
  return crypto.createHash('sha256').update(secret).digest();
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding ? `${normalized}${'='.repeat(4 - padding)}` : normalized;
  return Buffer.from(padded, 'base64');
}

function parseCookieHeader(headerValue) {
  return String(headerValue || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((out, item) => {
      const separator = item.indexOf('=');
      if (separator <= 0) return out;
      const key = item.slice(0, separator).trim();
      const value = item.slice(separator + 1).trim();
      if (!key) return out;
      out[key] = decodeURIComponent(value);
      return out;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Number(options.maxAge) || 0)}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

export function isAdminSessionConfigured() {
  return Boolean(getSessionKey());
}

export function createAdminSessionCookie(payload) {
  const key = getSessionKey();
  if (!key) {
    throw new Error('ADMIN_CONSOLE_SESSION_SECRET is not configured');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = JSON.stringify({
    ...payload,
    issuedAt: new Date().toISOString()
  });
  const encrypted = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const token = [iv, tag, encrypted].map(base64UrlEncode).join('.');

  return serializeCookie(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production'
  });
}

export function clearAdminSessionCookie() {
  return serializeCookie(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production'
  });
}

export function readAdminSessionFromRequest(req) {
  const key = getSessionKey();
  if (!key) return null;

  const cookies = parseCookieHeader(req?.headers?.cookie || '');
  const token = cookies[ADMIN_SESSION_COOKIE];
  if (!token) return null;

  const [ivEncoded, tagEncoded, payloadEncoded] = String(token).split('.');
  if (!ivEncoded || !tagEncoded || !payloadEncoded) return null;

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, base64UrlDecode(ivEncoded));
    decipher.setAuthTag(base64UrlDecode(tagEncoded));
    const decrypted = Buffer.concat([
      decipher.update(base64UrlDecode(payloadEncoded)),
      decipher.final()
    ]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (_err) {
    return null;
  }
}

export function getAdminSessionSummary(session) {
  if (!session) return null;
  return {
    adminMode: session.adminMode,
    actor: session.adminMode === 'jwt' ? (session.adminActor || 'jwt-actor') : (session.adminActor || `key:${session.adminKeyId || 'legacy'}`)
  };
}

export { ADMIN_SESSION_COOKIE };