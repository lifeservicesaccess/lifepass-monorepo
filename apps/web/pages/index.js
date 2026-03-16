import React, { useState } from 'react';
import axios from 'axios';
import Link from 'next/link';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) return '';
  return baseUrl.replace(/\/$/, '');
}

function apiPath(pathname) {
  const configured = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  if (!configured) {
    return pathname;
  }
  return `${configured}${pathname}`;
}

function apiTargetLabel() {
  const configured = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  if (configured) return configured;

  if (process.env.NODE_ENV === 'development') {
    const rewriteTarget = normalizeBaseUrl(process.env.LOCAL_API_BASE_URL || 'http://localhost:3003');
    return `relative paths (dev rewrite -> ${rewriteTarget})`;
  }

  return 'relative paths (same origin)';
}

export default function Home() {
  const [birthYear, setBirthYear] = useState('');
  const [status, setStatus] = useState('');
  const apiTarget = apiTargetLabel();

  const { address: wallet } = useAccount();

  async function handleMint() {
    if (!wallet) {
      setStatus('Please connect your wallet before minting.');
      return;
    }
    if (!birthYear || isNaN(parseInt(birthYear, 10))) {
      setStatus('Please enter a valid birth year.');
      return;
    }
    try {
      setStatus('Generating proof...');
      const numericBirthYear = parseInt(birthYear || '0', 10);
      const proofGenRes = await axios.post(apiPath('/proof/generate'), {
        birthYear: numericBirthYear
      });
      if (!proofGenRes.data.success) {
        setStatus('Proof generation failed: ' + (proofGenRes.data.error || 'unknown error'));
        return;
      }

      const proofRes = await axios.post(apiPath('/proof/submit'), {
        proof: proofGenRes.data.proof,
        publicSignals: proofGenRes.data.publicSignals
      });
      if (!proofRes.data.success) {
        setStatus('Proof failed: ' + (proofRes.data.error || 'unknown error'));
        return;
      }
      setStatus('Proof verified. Minting token...');
      const tokenId = Math.floor(Math.random() * 1e9);
      const meta = {
        purpose: 'LifePass',
        trustScore: 0,
        verificationLevel: 'Silver',
        didUri: ''
      };
      const mintRes = await axios.post('/api/mint', {
        to: wallet,
        tokenId,
        metadata: meta
      });
      if (!mintRes.data.success) {
        const reasonSuffix = mintRes.data.reason ? ` (reason: ${mintRes.data.reason})` : '';
        setStatus('Mint failed: ' + (mintRes.data.error || 'unknown error') + reasonSuffix);
      } else if (mintRes.data.simulated) {
        const reasonSuffix = mintRes.data.chainError
          ? ` (on-chain reason: ${mintRes.data.chainError})`
          : '';
        setStatus('Mint simulated (dev mode). Transaction reference: ' + mintRes.data.txHash + reasonSuffix);
      } else {
        setStatus('Mint successful on-chain. Transaction hash: ' + mintRes.data.txHash);
      }
    } catch (err) {
      console.error(err);
      const backendError = err?.response?.data?.error;
      const backendReason = err?.response?.data?.reason;
      const statusCode = err?.response?.status;
      const detail = backendReason || err.message;
      const codeSuffix = statusCode ? ` [${statusCode}]` : '';
      setStatus('Error' + codeSuffix + ': ' + (backendError || 'request failed') + (detail ? ` (reason: ${detail})` : ''));
    }
  }

  return (
    <main className="lp-page">
      <div className="lp-shell">
        <span className="lp-kicker">Identity Rail</span>
        <h1 className="lp-title">LifePass Mint Portal</h1>
        <p className="lp-subtitle">Generate age proof and mint your Soulbound pass against the active API target.</p>

        <div className="lp-nav">
          <Link href="/signup">Onboarding</Link>
          <Link href="/dashboard">Dashboard</Link>
        </div>

        <div className="lp-badge">
          <span className="font-semibold">API target:</span>{' '}
          <span className="lp-mono">{apiTarget}</span>
        </div>

        <section className="lp-panel">
          <h2 className="lp-panel-title">Mint Input</h2>
          <p className="lp-subtitle">Connect wallet, enter birth year, then submit proof and mint in one step.</p>

          <div className="lp-grid lp-grid-2" style={{ marginTop: '0.8rem' }}>
            <div>
              <label className="lp-label" htmlFor="birthYear">Birth year</label>
              <input
                id="birthYear"
                className="lp-input"
                type="number"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                placeholder="e.g. 2000"
              />
            </div>
            <div>
              <label className="lp-label">Wallet connection</label>
              <div className="lp-panel" style={{ marginTop: 0, padding: '0.52rem', borderStyle: 'dashed' }}>
                <ConnectButton showBalance={false} />
              </div>
            </div>
          </div>

          <div className="lp-actions">
            <button
              onClick={handleMint}
              disabled={!birthYear || !wallet}
              className="lp-button"
            >
              Submit Proof & Mint
            </button>
          </div>

          {status && <p className="lp-status">{status}</p>}
        </section>
      </div>
    </main>
  );
}
