import React, { useState } from 'react';
import axios from 'axios';

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
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');

  async function loadDashboard() {
    try {
      setStatus('Loading...');
      const res = await axios.get(apiPath(`/users/${encodeURIComponent(userId)}/dashboard`));
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
          </section>
        ) : null}
      </div>
    </main>
  );
}
