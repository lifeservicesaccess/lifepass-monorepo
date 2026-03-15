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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const apiBaseUrl = resolveApiBaseUrl();
  const apiKey = process.env.API_KEY;

  if (!apiBaseUrl) {
    return res.status(500).json({ success: false, error: 'API base URL is not configured' });
  }

  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'Server API key is not configured' });
  }

  try {
    const upstream = await fetch(`${apiBaseUrl}/sbt/mint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(req.body || {})
    });

    const text = await upstream.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch (_err) {
      payload = { success: false, error: text || 'Mint proxy upstream returned a non-JSON response' };
    }

    return res.status(upstream.status).json(payload);
  } catch (err) {
    return res.status(502).json({
      success: false,
      error: 'Mint proxy failed',
      reason: err.message || String(err)
    });
  }
}
