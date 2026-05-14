import React, { useState } from 'react';
import Link from 'next/link';
import axios from 'axios';

export default function AdminAccessPage() {
  const [apiKey, setApiKey] = useState('');
  const [adminMode, setAdminMode] = useState('key');
  const [adminCredential, setAdminCredential] = useState('');
  const [adminKeyId, setAdminKeyId] = useState('');
  const [adminActor, setAdminActor] = useState('governance-admin');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function startSession() {
    try {
      setSubmitting(true);
      setStatus('Validating admin access...');
      await axios.post('/api/admin/session', {
        apiKey,
        adminMode,
        adminCredential,
        adminKeyId,
        adminActor
      });
      window.location.href = '/admin';
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || 'Admin access failed';
      setStatus(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="lp-page">
      <div className="lp-shell" style={{ maxWidth: '780px' }}>
        <span className="lp-kicker">Restricted Access</span>
        <h1 className="lp-title">Admin Session Gate</h1>
        <p className="lp-subtitle">Validate an approved admin credential once, then operate the governance console through a server-side session.</p>

        <div className="lp-nav">
          <Link href="/">Mint Portal</Link>
          <Link href="/signup">Onboarding</Link>
          <Link href="/dashboard">Dashboard</Link>
        </div>

        <section className="lp-panel">
          <h2 className="lp-panel-title">Access Request</h2>
          <div className="lp-grid lp-grid-2" style={{ marginTop: '0.76rem' }}>
            <div>
              <label className="lp-label" htmlFor="adminApiKey">API key</label>
              <input id="adminApiKey" className="lp-input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="x-api-key" />
            </div>
            <div>
              <label className="lp-label" htmlFor="adminMode">Admin auth mode</label>
              <select id="adminMode" className="lp-select" value={adminMode} onChange={(e) => setAdminMode(e.target.value)}>
                <option value="key">Rotated key</option>
                <option value="jwt">Bearer JWT</option>
              </select>
            </div>
            <div>
              <label className="lp-label" htmlFor="adminCredential">Credential</label>
              <input id="adminCredential" className="lp-input" value={adminCredential} onChange={(e) => setAdminCredential(e.target.value)} placeholder={adminMode === 'jwt' ? 'Bearer token' : 'Admin key'} />
            </div>
            <div>
              <label className="lp-label" htmlFor="adminKeyId">Key ID / actor</label>
              {adminMode === 'jwt' ? (
                <input id="adminActor" className="lp-input" value={adminActor} onChange={(e) => setAdminActor(e.target.value)} placeholder="Expected JWT actor" />
              ) : (
                <input id="adminKeyId" className="lp-input" value={adminKeyId} onChange={(e) => setAdminKeyId(e.target.value)} placeholder="current" />
              )}
            </div>
          </div>

          {adminMode === 'key' ? (
            <div style={{ marginTop: '0.76rem' }}>
              <label className="lp-label" htmlFor="adminActorHeader">Admin actor</label>
              <input id="adminActorHeader" className="lp-input" value={adminActor} onChange={(e) => setAdminActor(e.target.value)} placeholder="governance-admin" />
            </div>
          ) : null}

          <div className="lp-actions">
            <button className="lp-button" type="button" disabled={submitting} onClick={startSession}>Start Admin Session</button>
          </div>
          <p className="lp-subtitle" style={{ marginTop: '0.76rem' }}>Use one approved admin mode only. Mixed key and JWT deployments are rejected by the API.</p>
          {status ? <p className="lp-status">{status}</p> : null}
        </section>
      </div>
    </main>
  );
}