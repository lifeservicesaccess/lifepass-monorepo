import React, { useState } from 'react';
import axios from 'axios';
import Link from 'next/link';

// Import RainbowKit and wagmi hooks for wallet connection
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) return '';
  return baseUrl.replace(/\/$/, '');
}

function apiPath(pathname) {
  const configured = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  if (!configured) {
    // In local dev, relative paths rely on Next.js rewrites in next.config.js.
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

/**
 * Home page for the LifePass web portal.  This simple interface allows a user to
 * input their birth year and wallet address, submit a zero‑knowledge proof of
 * being over 18, and mint a LifePass Soulbound Token via the backend API.  In a
 * real application the proof would be generated off‑chain using snarkjs and
 * integrated with a wallet provider such as WalletConnect or MetaMask.
 */
export default function Home() {
  const [birthYear, setBirthYear] = useState('');
  const [status, setStatus] = useState('');
  const apiTarget = apiTargetLabel();

  // Retrieve the connected wallet address from wagmi.  When the user
  // connects their wallet via the ConnectButton, this hook will update.
  const { address: wallet } = useAccount();

  async function handleMint() {
    try {
      setStatus('Generating proof…');
      const currentYear = new Date().getFullYear();
      const is_over_18 = currentYear - parseInt(birthYear || '0', 10) >= 18 ? 1 : 0;
      // Submit the proof. In local/demo mode we send a bytes-like placeholder that
      // matches the API contract while publicSignals carries the age predicate.
      const proofRes = await axios.post(apiPath('/proof/submit'), {
        proof: '0x1234',
        publicSignals: { is_over_18 }
      });
      if (!proofRes.data.success) {
        setStatus('Proof failed: ' + (proofRes.data.error || 'unknown error'));
        return;
      }
      setStatus('Proof verified. Minting token…');
      const tokenId = Math.floor(Math.random() * 1e9);
      const meta = {
        purpose: 'LifePass',
        trustScore: 0,
        verificationLevel: 'Silver',
        didUri: ''
      };
      const mintRes = await axios.post(apiPath('/sbt/mint'), {
        // Use the connected wallet address for minting.  The backend will
        // submit the transaction on behalf of the user.  Ensure the user
        // has connected a wallet before attempting to mint.
        to: wallet,
        tokenId,
        metadata: meta
      });
      if (!mintRes.data.success) {
        const reasonSuffix = mintRes.data.reason ? ` (reason: ${mintRes.data.reason})` : '';
        setStatus('Mint failed: ' + (mintRes.data.error || 'unknown error') + reasonSuffix);
      } else {
        if (mintRes.data.simulated) {
          const reasonSuffix = mintRes.data.chainError
            ? ` (on-chain reason: ${mintRes.data.chainError})`
            : '';
          setStatus('Mint simulated (dev mode). Transaction reference: ' + mintRes.data.txHash + reasonSuffix);
        } else {
          setStatus('Mint successful on-chain. Transaction hash: ' + mintRes.data.txHash);
        }
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
    <main className="max-w-xl mx-auto mt-8 p-4">
      <div className="mb-3 rounded border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <span className="font-semibold">API target:</span>{' '}
        <span className="font-mono break-all">{apiTarget}</span>
      </div>
      <h1 className="text-2xl font-semibold mb-2">LifePass SBT Minting</h1>
      <p className="text-sm mb-2">
        <Link className="underline" href="/signup">Onboarding</Link>
        {' | '}
        <Link className="underline" href="/dashboard">Dashboard</Link>
      </p>
      <p className="text-sm text-slate-700 mb-4">Enter your birth year and connect your wallet to mint a LifePass soulbound token.</p>
      <div className="mb-4">
        <label className="flex items-center gap-2">
          <span className="text-sm">Birth year:</span>
          <input
            className="border rounded px-2 py-1 w-32"
            type="number"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            placeholder="e.g. 2000"
          />
        </label>
      </div>
      <div className="mb-4">
        <ConnectButton showBalance={false} />
      </div>
      <button
        onClick={handleMint}
        disabled={!birthYear || !wallet}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        Submit Proof & Mint
      </button>
      {status && (
        <p className="mt-4 text-sm text-slate-800">{status}</p>
      )}
    </main>
  );
}
