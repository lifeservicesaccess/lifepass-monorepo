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

export default function GuideChat({ userId }) {
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);

  async function askGuide() {
    if (!message || !userId) return;
    setLoading(true);
    try {
      const res = await axios.post(apiPath('/ai/chat'), { userId, message });
      if (res.data?.success) {
        setResult(res.data.result || null);
        setReply(res.data.result?.text || 'No response from guide.');
      } else {
        setResult(null);
        setReply(res.data?.error || 'Guide request failed');
      }
    } catch (err) {
      setResult(null);
      setReply(`Guide error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="lp-panel">
      <h3 className="lp-panel-title">AI Onboarding Guide</h3>
      <p className="lp-subtitle">Ask for next steps, trust-building ideas, or portal recommendations.</p>
      <div style={{ marginTop: '0.72rem' }}>
        <label className="lp-label" htmlFor="guideMessage">Message</label>
        <textarea
          id="guideMessage"
          className="lp-textarea"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask for onboarding help or portal recommendations"
        />
      </div>
      <div className="lp-actions">
        <button
          className="lp-button-secondary"
          disabled={!message || !userId || loading}
          onClick={askGuide}
        >
          {loading ? 'Asking...' : 'Ask Guide'}
        </button>
      </div>
      {reply ? <p className="lp-status">{reply}</p> : null}
      {result?.recommendedPortal ? (
        <div className="lp-meta-grid">
          <div className="lp-chip">Recommended portal: {result.recommendedPortal}</div>
          <div className="lp-chip">Trust: {result.trust?.level || 'Bronze'}</div>
          <div className="lp-chip">Completed milestones: {result.milestoneSummary?.completed || 0}</div>
        </div>
      ) : null}
      {result?.nextMilestone ? (
        <div className="lp-mini-card">
          <strong>Next milestone</strong>
          <p>{result.nextMilestone.title}</p>
        </div>
      ) : null}
      {Array.isArray(result?.kairosSignals) && result.kairosSignals.length > 0 ? (
        <div className="lp-list" style={{ marginTop: '0.72rem' }}>
          {result.kairosSignals.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      ) : null}
      {result?.channels ? (
        <div className="lp-actions">
          <a className="lp-button-secondary" href={result.channels.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a>
          <a className="lp-button-secondary" href={result.channels.telegram} target="_blank" rel="noreferrer">Telegram</a>
        </div>
      ) : null}
    </section>
  );
}
