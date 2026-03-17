import React, { useState } from 'react';
import axios from 'axios';
import Link from 'next/link';

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) return '';
  return baseUrl.replace(/\/$/, '');
}

function apiPath(pathname) {
  const configured = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  if (!configured) return pathname;
  return `${configured}${pathname}`;
}

export default function DashboardPage() {
  const [userId, setUserId] = useState('');
  const [accessMode, setAccessMode] = useState('api-key');
  const [credential, setCredential] = useState('');
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');

  function requestHeaders() {
    if (!credential) return {};
    if (accessMode === 'token') {
      return { Authorization: `Bearer ${credential}` };
    }
    return { 'x-api-key': credential };
  }

  async function loadDashboard() {
    try {
      setStatus('Loading...');
      const res = await axios.get(apiPath(`/users/${encodeURIComponent(userId)}/dashboard`), {
        headers: requestHeaders()
      });
      if (res.data?.success) {
        setData(res.data);
        setStatus('Loaded profile and trust snapshot.');
      } else {
        setStatus(res.data?.error || 'Failed to load dashboard');
      }
    } catch (err) {
      setStatus(`Dashboard error: ${err.message}`);
      setData(null);
    }
  }

  return (
    <main className="lp-page">
      <div className="lp-shell">
        <span className="lp-kicker">Trust Lens</span>
        <h1 className="lp-title">LifePass Dashboard</h1>
        <p className="lp-subtitle">Fetch a user snapshot to inspect profile, trust level, and mint readiness context.</p>

        <div className="lp-nav">
          <Link href="/">Mint Portal</Link>
          <Link href="/signup">Onboarding</Link>
          <Link href="/admin">Admin Console</Link>
        </div>

        <section className="lp-panel">
          <h2 className="lp-panel-title">Lookup</h2>
          <div className="lp-grid lp-grid-2" style={{ marginTop: '0.76rem' }}>
            <div>
              <label className="lp-label" htmlFor="dashboardUserId">User ID</label>
              <input
                id="dashboardUserId"
                className="lp-input"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Enter userId"
              />
            </div>
            <div className="lp-actions" style={{ alignItems: 'end', marginTop: 0 }}>
              <button className="lp-button" onClick={loadDashboard} disabled={!userId}>Load Snapshot</button>
            </div>
            <div>
              <label className="lp-label" htmlFor="dashboardAccessMode">Access mode</label>
              <select id="dashboardAccessMode" className="lp-select" value={accessMode} onChange={(e) => setAccessMode(e.target.value)}>
                <option value="api-key">API key</option>
                <option value="token">Bearer token</option>
              </select>
            </div>
            <div>
              <label className="lp-label" htmlFor="dashboardCredential">Credential</label>
              <input
                id="dashboardCredential"
                className="lp-input"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                placeholder={accessMode === 'token' ? 'Paste LifePass bearer token' : 'Paste API key'}
              />
            </div>
          </div>
          {status ? <p className="lp-status">{status}</p> : null}
        </section>

        {data ? (
          <section className="lp-panel">
            <h2 className="lp-panel-title">Snapshot</h2>
            <div className="lp-kv">
              <p><span>Name:</span>{data.profile?.name || 'N/A'}</p>
              <p><span>Purpose:</span>{data.profile?.purpose || 'N/A'}</p>
              <p><span>Verification:</span>{data.profile?.verificationStatus || 'N/A'}</p>
              <p><span>Trust score:</span>{data.trust?.score}</p>
              <p><span>Trust level:</span>{data.trust?.level}</p>
              <p><span>Reason:</span>{data.trust?.reason}</p>
            </div>
            <div className="lp-meta-grid">
              <div className="lp-chip">Completed: {data.milestoneSummary?.completed || 0}</div>
              <div className="lp-chip">In progress: {data.milestoneSummary?.inProgress || 0}</div>
              <div className="lp-chip">Pending: {data.milestoneSummary?.pending || 0}</div>
            </div>
            {Array.isArray(data.badges) && data.badges.length > 0 ? (
              <div className="lp-meta-grid">
                {data.badges.map((badge) => (
                  <div key={badge.code} className="lp-chip">{badge.name}</div>
                ))}
              </div>
            ) : null}
            {data.profile?.visibility ? (
              <div className="lp-list" style={{ marginTop: '0.8rem' }}>
                <p>Visible on pass: {Object.entries(data.profile.visibility).filter(([, enabled]) => enabled).map(([key]) => key).join(', ') || 'none'}</p>
              </div>
            ) : null}
            {Array.isArray(data.milestones) && data.milestones.length > 0 ? (
              <div className="lp-list" style={{ marginTop: '0.8rem' }}>
                {data.milestones.map((milestone) => (
                  <p key={milestone.id}>{milestone.title} · {milestone.status}</p>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
