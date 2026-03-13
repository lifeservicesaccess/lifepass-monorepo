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
  const [legalName, setLegalName] = useState('');
  const [covenantName, setCovenantName] = useState('');
  const [purposeStatement, setPurposeStatement] = useState('');
  const [skills, setSkills] = useState('builder, teacher');
  const [callings, setCallings] = useState('service, leadership');
  const [docs, setDocs] = useState('id-card.pdf');
  const [verifierName, setVerifierName] = useState('');
  const [verifierType, setVerifierType] = useState('church');
  const [endorsement, setEndorsement] = useState('');
  const [trustLevel, setTrustLevel] = useState('');
  const [status, setStatus] = useState('');

  async function submitSignup() {
    try {
      const payload = {
        userId,
        legalName,
        covenantName,
        purposeStatement,
        skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
        callings: callings.split(',').map((s) => s.trim()).filter(Boolean),
        verificationDocs: docs.split(',').map((d) => d.trim()).filter(Boolean)
      };
      const res = await axios.post(apiPath('/onboarding/signup'), payload);
      if (res.data?.success) {
        setTrustLevel(res.data?.trust?.level || 'Bronze');
        setStatus('Signup submitted. Verification status is pending and trust level is initialized.');
      } else {
        setStatus(`Signup failed: ${res.data?.error || 'unknown error'}`);
      }
    } catch (err) {
      setStatus(`Signup error: ${err.message}`);
    }
  }

  async function submitVerifier() {
    try {
      const payload = {
        userId,
        verifierName,
        verifierType,
        endorsement
      };
      const res = await axios.post(apiPath('/onboarding/verifier-submission'), payload);
      if (res.data?.success) {
        setStatus(`Verifier submitted. Sources: ${res.data?.verifierSubmissionsCount || 0}`);
      } else {
        setStatus(`Verifier submission failed: ${res.data?.error || 'unknown error'}`);
      }
    } catch (err) {
      setStatus(`Verifier submission error: ${err.message}`);
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-4 mt-8">
      <h1 className="text-2xl font-semibold mb-3">LifePass Onboarding</h1>
      <p className="text-sm text-slate-700 mb-4">Create your profile DNA, initialize Bronze trust, then submit verification sources.</p>
      <div className="grid gap-3">
        <input className="border rounded p-2" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="userId" />
        <input className="border rounded p-2" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="legal name" />
        <input className="border rounded p-2" value={covenantName} onChange={(e) => setCovenantName(e.target.value)} placeholder="covenant name (optional)" />
        <input className="border rounded p-2" value={purposeStatement} onChange={(e) => setPurposeStatement(e.target.value)} placeholder="purpose statement" />
        <input className="border rounded p-2" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="skills (comma-separated)" />
        <input className="border rounded p-2" value={callings} onChange={(e) => setCallings(e.target.value)} placeholder="callings (comma-separated)" />
        <input className="border rounded p-2" value={docs} onChange={(e) => setDocs(e.target.value)} placeholder="verification docs (comma-separated)" />
      </div>
      <button className="mt-4 bg-blue-600 text-white px-4 py-2 rounded" onClick={submitSignup}>Submit Signup</button>
      <div className="mt-6 border rounded p-3 grid gap-3">
        <h2 className="text-lg font-medium">Add Verification Source</h2>
        <input className="border rounded p-2" value={verifierName} onChange={(e) => setVerifierName(e.target.value)} placeholder="verifier name" />
        <select className="border rounded p-2" value={verifierType} onChange={(e) => setVerifierType(e.target.value)}>
          <option value="church">church</option>
          <option value="school">school</option>
          <option value="co-op">co-op</option>
          <option value="employer">employer</option>
          <option value="leader">leader</option>
          <option value="other">other</option>
        </select>
        <input className="border rounded p-2" value={endorsement} onChange={(e) => setEndorsement(e.target.value)} placeholder="endorsement note (optional)" />
        <button className="bg-slate-800 text-white px-4 py-2 rounded" onClick={submitVerifier}>Submit Verifier Source</button>
      </div>
      {status ? <p className="mt-3 text-sm">{status}</p> : null}
      {trustLevel ? <p className="mt-1 text-sm text-emerald-700">Current trust tier: {trustLevel}</p> : null}
      <GuideChat userId={userId} />
    </main>
  );
}
