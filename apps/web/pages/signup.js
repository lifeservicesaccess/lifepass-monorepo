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
    <main className="lp-page">
      <div className="lp-shell">
        <span className="lp-kicker">Onboarding</span>
        <h1 className="lp-title">LifePass Identity Setup</h1>
        <p className="lp-subtitle">Build your profile DNA, initialize trust, and submit verification sources.</p>

        <section className="lp-panel">
          <h2 className="lp-panel-title">Profile DNA</h2>
          <div className="lp-grid lp-grid-2" style={{ marginTop: '0.75rem' }}>
            <div>
              <label className="lp-label" htmlFor="userId">User ID</label>
              <input id="userId" className="lp-input" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="userId" />
            </div>
            <div>
              <label className="lp-label" htmlFor="legalName">Legal name</label>
              <input id="legalName" className="lp-input" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="legal name" />
            </div>
            <div>
              <label className="lp-label" htmlFor="covenantName">Covenant name</label>
              <input id="covenantName" className="lp-input" value={covenantName} onChange={(e) => setCovenantName(e.target.value)} placeholder="optional" />
            </div>
            <div>
              <label className="lp-label" htmlFor="purposeStatement">Purpose statement</label>
              <input id="purposeStatement" className="lp-input" value={purposeStatement} onChange={(e) => setPurposeStatement(e.target.value)} placeholder="what are you building" />
            </div>
            <div>
              <label className="lp-label" htmlFor="skills">Skills</label>
              <input id="skills" className="lp-input" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="comma-separated" />
            </div>
            <div>
              <label className="lp-label" htmlFor="callings">Callings</label>
              <input id="callings" className="lp-input" value={callings} onChange={(e) => setCallings(e.target.value)} placeholder="comma-separated" />
            </div>
          </div>

          <div style={{ marginTop: '0.72rem' }}>
            <label className="lp-label" htmlFor="docs">Verification docs</label>
            <input id="docs" className="lp-input" value={docs} onChange={(e) => setDocs(e.target.value)} placeholder="comma-separated" />
          </div>

          <div className="lp-actions">
            <button className="lp-button" onClick={submitSignup}>Submit Signup</button>
          </div>
        </section>

        <section className="lp-panel">
          <h2 className="lp-panel-title">Add Verification Source</h2>
          <div className="lp-grid lp-grid-2" style={{ marginTop: '0.75rem' }}>
            <div>
              <label className="lp-label" htmlFor="verifierName">Verifier name</label>
              <input id="verifierName" className="lp-input" value={verifierName} onChange={(e) => setVerifierName(e.target.value)} placeholder="verifier or institution" />
            </div>
            <div>
              <label className="lp-label" htmlFor="verifierType">Verifier type</label>
              <select id="verifierType" className="lp-select" value={verifierType} onChange={(e) => setVerifierType(e.target.value)}>
                <option value="church">church</option>
                <option value="school">school</option>
                <option value="co-op">co-op</option>
                <option value="employer">employer</option>
                <option value="leader">leader</option>
                <option value="other">other</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: '0.72rem' }}>
            <label className="lp-label" htmlFor="endorsement">Endorsement note</label>
            <input id="endorsement" className="lp-input" value={endorsement} onChange={(e) => setEndorsement(e.target.value)} placeholder="optional" />
          </div>

          <div className="lp-actions">
            <button className="lp-button-secondary" onClick={submitVerifier}>Submit Verifier Source</button>
          </div>
        </section>

        {status ? <p className="lp-status">{status}</p> : null}
        {trustLevel ? <p className="lp-subtitle lp-note-success" style={{ marginTop: '0.55rem' }}>Current trust tier: {trustLevel}</p> : null}
        <GuideChat userId={userId} />
      </div>
    </main>
  );
}
