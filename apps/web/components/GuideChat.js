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
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);

  async function askGuide() {
    if (!message || !userId) return;
    setLoading(true);
    try {
      const res = await axios.post(apiPath('/ai/chat'), { userId, message });
      if (res.data?.success) {
        setReply(res.data.result?.text || 'No response from guide.');
      } else {
        setReply(res.data?.error || 'Guide request failed');
      }
    } catch (err) {
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
    </section>
  );
}
