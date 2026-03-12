import React, { useState } from 'react';
import axios from 'axios';
import GuideChat from '../components/GuideChat';

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) return '';
  return baseUrl.replace(/\/$/, '');
}

function apiPath(pathname) {
  const configured = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  if (!configured) return pathname;
  return `${configured}${pathname}`;
}

export default function SignupPage() {
  const [userId, setUserId] = useState(`user_${Date.now()}`);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [skills, setSkills] = useState('');
  const [docs, setDocs] = useState('id-card.pdf');
  const [status, setStatus] = useState('');

  async function submitSignup() {
    try {
      const payload = {
        userId,
        name,
        purpose,
        skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
        verificationDocs: docs.split(',').map((d) => d.trim()).filter(Boolean)
      };
      const res = await axios.post(apiPath('/onboarding/signup'), payload);
      if (res.data?.success) {
        setStatus('Signup submitted. Verification status is pending.');
      } else {
        setStatus(`Signup failed: ${res.data?.error || 'unknown error'}`);
      }
    } catch (err) {
      setStatus(`Signup error: ${err.message}`);
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-4 mt-8">
      <h1 className="text-2xl font-semibold mb-3">LifePass Onboarding</h1>
      <p className="text-sm text-slate-700 mb-4">Create a profile with your purpose and skills, then submit verification docs.</p>
      <div className="grid gap-3">
        <input className="border rounded p-2" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="userId" />
        <input className="border rounded p-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="name" />
        <input className="border rounded p-2" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="purpose" />
        <input className="border rounded p-2" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="skills (comma-separated)" />
        <input className="border rounded p-2" value={docs} onChange={(e) => setDocs(e.target.value)} placeholder="verification docs (comma-separated)" />
      </div>
      <button className="mt-4 bg-blue-600 text-white px-4 py-2 rounded" onClick={submitSignup}>Submit Signup</button>
      {status ? <p className="mt-3 text-sm">{status}</p> : null}
      <GuideChat userId={userId} />
    </main>
  );
}
