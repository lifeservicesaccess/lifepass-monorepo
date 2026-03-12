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
        setStatus('Loaded');
      } else {
        setStatus(res.data?.error || 'Failed to load dashboard');
      }
    } catch (err) {
      setStatus(`Dashboard error: ${err.message}`);
      setData(null);
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-4 mt-8">
      <h1 className="text-2xl font-semibold mb-3">LifePass Dashboard</h1>
      <div className="flex gap-2">
        <input className="border rounded p-2 flex-1" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Enter userId" />
        <button className="bg-slate-900 text-white px-4 rounded" onClick={loadDashboard} disabled={!userId}>Load</button>
      </div>
      {status ? <p className="mt-3 text-sm">{status}</p> : null}
      {data ? (
        <section className="mt-4 border rounded p-3 bg-white">
          <h2 className="font-semibold">Profile</h2>
          <p className="text-sm">Name: {data.profile?.name || 'N/A'}</p>
          <p className="text-sm">Purpose: {data.profile?.purpose || 'N/A'}</p>
          <p className="text-sm">Verification: {data.profile?.verificationStatus || 'N/A'}</p>
          <h3 className="font-semibold mt-3">Trust Score</h3>
          <p className="text-sm">Score: {data.trust?.score}</p>
          <p className="text-sm">Level: {data.trust?.level}</p>
          <p className="text-sm">Reason: {data.trust?.reason}</p>
        </section>
      ) : null}
    </main>
  );
}
