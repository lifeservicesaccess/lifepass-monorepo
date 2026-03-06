import React, { useState } from 'react';
import axios from 'axios';

// Import RainbowKit and wagmi hooks for wallet connection
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

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

  // Retrieve the connected wallet address from wagmi.  When the user
  // connects their wallet via the ConnectButton, this hook will update.
  const { address: wallet } = useAccount();

  async function handleMint() {
    try {
      setStatus('Generating proof…');
      const currentYear = new Date().getFullYear();
      const is_over_18 = currentYear - parseInt(birthYear || '0', 10) >= 18 ? 1 : 0;
      // Submit the proof.  Here we fake the proof payload and pass only the public signal.
      const proofRes = await axios.post('/proof/submit', {
        proof: {},
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
      const mintRes = await axios.post('/sbt/mint', {
        // Use the connected wallet address for minting.  The backend will
        // submit the transaction on behalf of the user.  Ensure the user
        // has connected a wallet before attempting to mint.
        to: wallet,
        tokenId,
        metadata: meta
      });
      if (!mintRes.data.success) {
        setStatus('Mint failed: ' + (mintRes.data.error || 'unknown error'));
      } else {
        setStatus('Mint successful! Transaction hash: ' + mintRes.data.txHash);
      }
    } catch (err) {
      console.error(err);
      setStatus('Error: ' + err.message);
    }
  }

  return (
    <main className="max-w-xl mx-auto mt-8 p-4">
      <h1 className="text-2xl font-semibold mb-2">LifePass SBT Minting</h1>
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
