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
    <section className="border rounded p-3 mt-4 bg-slate-50">
      <h3 className="font-semibold mb-2">AI Onboarding Guide</h3>
      <textarea
        className="w-full border rounded p-2 text-sm"
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask for onboarding help or portal recommendations"
      />
      <button
        className="mt-2 bg-slate-900 text-white px-3 py-1 rounded disabled:opacity-50"
        disabled={!message || !userId || loading}
        onClick={askGuide}
      >
        {loading ? 'Asking...' : 'Ask Guide'}
      </button>
      {reply ? <p className="text-sm mt-3">{reply}</p> : null}
    </section>
  );
}
