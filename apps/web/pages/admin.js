import React, { useState } from 'react';
import axios from 'axios';
import Link from 'next/link';

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) return '';
  return baseUrl.replace(/\/$/, '');
}

function apiPath(pathname) {
  const configured = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  if (!configured) return pathname;
  return `${configured}${pathname}`;
}

const SAMPLE_POLICY = JSON.stringify({
  health: {
    ageGatedServices: { minTrustLevel: 'bronze', audience: 'zionstack-portals' }
  }
}, null, 2);

function buildApprovalCommand(proposal, approverId) {
  if (!proposal) return '';
  const approver = String(approverId || '<approver-id>').trim() || '<approver-id>';
  return [
    'cd services/api',
    `npm run sign:approval -- --proposal-id "${proposal.id}" --action "${proposal.action}" --payload-hash "${proposal.payloadHash}" --secret "<${approver}-shared-secret>"`
  ].join('\n');
}

function getHealthCheck(health, checkName) {
  return (health?.checks || []).find((item) => item.check === checkName) || null;
}

async function copyText(text) {
  const value = String(text || '');
  if (!value) throw new Error('Nothing to copy');

  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard is not available in this environment');
  }

  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', 'true');
  input.style.position = 'absolute';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
}

export default function AdminPage() {
  const [apiKey, setApiKey] = useState('');
  const [adminMode, setAdminMode] = useState('key');
  const [adminCredential, setAdminCredential] = useState('');
  const [adminKeyId, setAdminKeyId] = useState('');
  const [adminActor, setAdminActor] = useState('governance-admin');
  const [reason, setReason] = useState('');
  const [replaceMode, setReplaceMode] = useState(false);
  const [policyJson, setPolicyJson] = useState(SAMPLE_POLICY);
  const [proposalId, setProposalId] = useState('');
  const [approverId, setApproverId] = useState('');
  const [approvalSignature, setApprovalSignature] = useState('');
  const [snapshotId, setSnapshotId] = useState('');
  const [status, setStatus] = useState('');
  const [health, setHealth] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const [preview, setPreview] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [policyAudit, setPolicyAudit] = useState([]);
  const [accessAudit, setAccessAudit] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [exports, setExports] = useState({ policy: null, access: null });

  const selectedProposal = approvals.find((item) => item.id === proposalId) || null;
  const approvalMessage = selectedProposal
    ? `${selectedProposal.id}:${selectedProposal.action}:${selectedProposal.payloadHash}`
    : '';
  const approvalCommand = buildApprovalCommand(selectedProposal, approverId);
  const authModeCheck = getHealthCheck(health, 'Policy admin auth mode');
  const durableGovernanceCheck = getHealthCheck(health, 'Durable governance storage');
  const twoPersonCheck = getHealthCheck(health, 'POLICY_TWO_PERSON_REQUIRED readiness');

  function policyPayload() {
    return {
      matrix: JSON.parse(policyJson || '{}'),
      reason,
      replace: replaceMode
    };
  }

  function authHeaders() {
    const headers = {};
    if (apiKey) headers['x-api-key'] = apiKey;
    if (adminMode === 'jwt') {
      if (adminCredential) headers.Authorization = `Bearer ${adminCredential}`;
      return headers;
    }
    if (adminCredential) headers['x-policy-admin-key'] = adminCredential;
    if (adminKeyId) headers['x-policy-admin-key-id'] = adminKeyId;
    if (adminActor) headers['x-admin-actor'] = adminActor;
    return headers;
  }

  async function runAction(label, action) {
    try {
      setStatus(`${label}...`);
      await action();
      setStatus(`${label} complete.`);
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || 'Request failed';
      setStatus(`${label} failed: ${message}`);
    }
  }

  async function loadConsole() {
    await runAction('Loading admin console', async () => {
      const headers = authHeaders();
      const [healthRes, matrixRes, approvalsRes, snapshotsRes, policyAuditRes, accessAuditRes, alertsRes] = await Promise.all([
        axios.get(apiPath('/health')),
        axios.get(apiPath('/portals/policy-matrix'), { headers }),
        axios.get(apiPath('/portals/policy-approvals?limit=20'), { headers }),
        axios.get(apiPath('/portals/policy-snapshots?limit=20'), { headers }),
        axios.get(apiPath('/portals/policy-admin/audit?limit=20'), { headers }),
        axios.get(apiPath('/portals/access-audit?limit=20'), { headers }),
        axios.get(apiPath('/portals/access-audit/alerts?threshold=1&windowMinutes=1440'), { headers })
      ]);

      setHealth(healthRes.data);
      setMatrix(matrixRes.data?.matrix || null);
      setApprovals(approvalsRes.data?.proposals || []);
      setSnapshots(snapshotsRes.data?.snapshots || []);
      setPolicyAudit(policyAuditRes.data?.events || []);
      setAccessAudit(accessAuditRes.data?.events || []);
      setAlerts(alertsRes.data?.alerts || []);
    });
  }

  async function previewPolicyChange() {
    await runAction('Previewing policy update', async () => {
      const res = await axios.post(apiPath('/portals/policy-matrix/preview'), policyPayload(), {
        headers: authHeaders()
      });
      setPreview(res.data);
    });
  }

  async function applyPolicyChange() {
    await runAction('Applying policy update', async () => {
      const res = await axios.post(apiPath('/portals/policy-matrix'), policyPayload(), {
        headers: authHeaders()
      });
      setPreview(res.data);
      await loadConsole();
    });
  }

  async function restorePolicySnapshot() {
    if (!snapshotId) {
      setStatus('Snapshot ID is required.');
      return;
    }
    await runAction('Restoring snapshot', async () => {
      const res = await axios.post(apiPath(`/portals/policy-snapshots/${encodeURIComponent(snapshotId)}/restore`), {
        reason
      }, { headers: authHeaders() });
      setPreview(res.data);
      await loadConsole();
    });
  }

  async function approveProposal() {
    if (!proposalId || !approverId || !approvalSignature) {
      setStatus('Proposal ID, approver ID, and signature are required.');
      return;
    }
    await runAction('Approving proposal', async () => {
      const res = await axios.post(apiPath(`/portals/policy-approvals/${encodeURIComponent(proposalId)}/approve`), {
        approverId,
        signature: approvalSignature
      }, { headers: authHeaders() });
      setPreview(res.data);
      await loadConsole();
    });
  }

  async function exportAudit(scope) {
    const pathname = scope === 'policy'
      ? '/portals/policy-admin/audit/export'
      : '/portals/access-audit/export';
    await runAction(`Exporting ${scope} audit`, async () => {
      const res = await axios.get(apiPath(pathname), { headers: authHeaders() });
      setExports((current) => ({
        ...current,
        [scope]: res.data?.export || null
      }));
    });
  }

  async function copyApprovalMessage() {
    try {
      await copyText(approvalMessage);
      setStatus('Approval message copied.');
    } catch (err) {
      setStatus(`Copy failed: ${err.message || 'clipboard unavailable'}`);
    }
  }

  async function copyApprovalCommandText() {
    try {
      await copyText(approvalCommand);
      setStatus('Offline signing command copied.');
    } catch (err) {
      setStatus(`Copy failed: ${err.message || 'clipboard unavailable'}`);
    }
  }

  async function copySnapshotIdValue(value) {
    try {
      await copyText(value);
      setStatus('Snapshot ID copied.');
    } catch (err) {
      setStatus(`Copy failed: ${err.message || 'clipboard unavailable'}`);
    }
  }

  async function copyAuditRootHash(scope) {
    try {
      await copyText(exports[scope]?.rootHash || '');
      setStatus(`${scope === 'policy' ? 'Policy' : 'Access'} audit root hash copied.`);
    } catch (err) {
      setStatus(`Copy failed: ${err.message || 'clipboard unavailable'}`);
    }
  }

  return (
    <main className="lp-page">
      <div className="lp-shell lp-shell-wide">
        <span className="lp-kicker">Admin Oversight</span>
        <h1 className="lp-title">LifePass Governance Console</h1>
        <p className="lp-subtitle">Operate policy changes, approvals, audit review, and export from one admin surface.</p>

        <div className="lp-nav">
          <Link href="/">Mint Portal</Link>
          <Link href="/signup">Onboarding</Link>
          <Link href="/dashboard">Dashboard</Link>
        </div>

        <section className="lp-banner">
          <p><strong>Execution mode</strong></p>
          <p>{twoPersonCheck?.detail || 'Load console to determine whether policy actions execute immediately or become proposals.'}</p>
          <p>{authModeCheck?.detail || 'Load console to confirm admin auth mode.'}</p>
          <p>{durableGovernanceCheck?.detail || 'Load console to confirm whether governance is durable or still using file fallback.'}</p>
        </section>

        <section className="lp-panel">
          <h2 className="lp-panel-title">Access</h2>
          <div className="lp-grid lp-grid-4" style={{ marginTop: '0.76rem' }}>
            <div>
              <label className="lp-label" htmlFor="adminApiKey">API key</label>
              <input id="adminApiKey" className="lp-input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="x-api-key" />
            </div>
            <div>
              <label className="lp-label" htmlFor="adminMode">Admin auth mode</label>
              <select id="adminMode" className="lp-select" value={adminMode} onChange={(e) => setAdminMode(e.target.value)}>
                <option value="key">Rotated key</option>
                <option value="jwt">Bearer JWT</option>
              </select>
            </div>
            <div>
              <label className="lp-label" htmlFor="adminCredential">Credential</label>
              <input id="adminCredential" className="lp-input" value={adminCredential} onChange={(e) => setAdminCredential(e.target.value)} placeholder={adminMode === 'jwt' ? 'Bearer token' : 'Admin key'} />
            </div>
            <div>
              <label className="lp-label" htmlFor="adminKeyId">Key ID / actor</label>
              {adminMode === 'jwt' ? (
                <input id="adminActor" className="lp-input" value={adminActor} onChange={(e) => setAdminActor(e.target.value)} placeholder="Expected JWT actor" />
              ) : (
                <input id="adminKeyId" className="lp-input" value={adminKeyId} onChange={(e) => setAdminKeyId(e.target.value)} placeholder="current" />
              )}
            </div>
          </div>

          {adminMode === 'key' ? (
            <div style={{ marginTop: '0.76rem' }}>
              <label className="lp-label" htmlFor="adminActorHeader">Admin actor</label>
              <input id="adminActorHeader" className="lp-input" value={adminActor} onChange={(e) => setAdminActor(e.target.value)} placeholder="governance-admin" />
            </div>
          ) : null}

          <div className="lp-actions">
            <button className="lp-button" onClick={loadConsole}>Load Console</button>
            <button className="lp-button-secondary" onClick={() => exportAudit('policy')}>Export Policy Audit</button>
            <button className="lp-button-secondary" onClick={() => exportAudit('access')}>Export Access Audit</button>
          </div>

          {status ? <p className="lp-status">{status}</p> : null}
        </section>

        <div className="lp-split">
          <section className="lp-panel">
            <h2 className="lp-panel-title">Governance Health</h2>
            {health?.checks ? (
              <div className="lp-list" style={{ marginTop: '0.76rem' }}>
                {health.checks.map((item) => (
                  <p key={item.check}><strong>{item.status.toUpperCase()}</strong> {item.check}: {item.detail}</p>
                ))}
              </div>
            ) : (
              <p className="lp-subtitle">Load console to inspect startup governance readiness.</p>
            )}
          </section>

          <section className="lp-panel">
            <h2 className="lp-panel-title">Policy Change</h2>
            <label className="lp-label" htmlFor="policyReason">Reason</label>
            <input id="policyReason" className="lp-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this change is needed" />
            <label className="lp-label" htmlFor="policyJson" style={{ marginTop: '0.76rem' }}>Policy JSON</label>
            <textarea id="policyJson" className="lp-textarea" value={policyJson} onChange={(e) => setPolicyJson(e.target.value)} />
            <label className="lp-inline-check">
              <input type="checkbox" checked={replaceMode} onChange={(e) => setReplaceMode(e.target.checked)} />
              Replace existing override matrix instead of merging
            </label>
            <div className="lp-actions">
              <button className="lp-button" onClick={previewPolicyChange}>Preview</button>
              <button className="lp-button-secondary" onClick={applyPolicyChange}>Apply / Propose</button>
            </div>
          </section>
        </div>

        <div className="lp-split">
          <section className="lp-panel">
            <h2 className="lp-panel-title">Approvals</h2>
            <div className="lp-grid lp-grid-3" style={{ marginTop: '0.76rem' }}>
              <input className="lp-input" value={proposalId} onChange={(e) => setProposalId(e.target.value)} placeholder="Proposal ID" />
              <input className="lp-input" value={approverId} onChange={(e) => setApproverId(e.target.value)} placeholder="Approver ID" />
              <input className="lp-input" value={approvalSignature} onChange={(e) => setApprovalSignature(e.target.value)} placeholder="HMAC signature" />
            </div>
            <div className="lp-actions">
              <button className="lp-button-secondary" onClick={approveProposal}>Approve Proposal</button>
            </div>
            {selectedProposal ? (
              <div className="lp-mini-card" style={{ marginTop: '0.76rem' }}>
                <p><strong>Selected proposal</strong> {selectedProposal.id}</p>
                <p>Action: {selectedProposal.action}</p>
                <p>Approvals: {selectedProposal.approvals?.length || 0}/{selectedProposal.requiredApprovals}</p>
                <p>Generate the signature offline. Do not place approver shared secrets in this page.</p>
                <div className="lp-actions lp-actions-tight">
                  <button className="lp-button-secondary" type="button" onClick={copyApprovalMessage}>Copy Message</button>
                  <button className="lp-button-secondary" type="button" onClick={copyApprovalCommandText}>Copy Command</button>
                </div>
                <pre className="lp-code">{approvalMessage}</pre>
                <pre className="lp-code">{approvalCommand}</pre>
              </div>
            ) : (
              <p className="lp-subtitle" style={{ marginTop: '0.76rem' }}>Select a proposal ID from the list below to show the exact offline signing message and command.</p>
            )}
            <div className="lp-list" style={{ marginTop: '0.76rem' }}>
              {approvals.map((item) => (
                <p key={item.id}>
                  <strong>{item.status}</strong> {item.id} · {item.action} · approvals {item.approvals?.length || 0}/{item.requiredApprovals}
                  {' '}
                  <button className="lp-button-secondary" type="button" onClick={() => setProposalId(item.id)}>Use</button>
                </p>
              ))}
            </div>
          </section>

          <section className="lp-panel">
            <h2 className="lp-panel-title">Snapshots</h2>
            <div className="lp-grid lp-grid-2" style={{ marginTop: '0.76rem' }}>
              <input className="lp-input" value={snapshotId} onChange={(e) => setSnapshotId(e.target.value)} placeholder="Snapshot ID" />
              <button className="lp-button-secondary" onClick={restorePolicySnapshot}>Restore Snapshot</button>
            </div>
            <div className="lp-list" style={{ marginTop: '0.76rem' }}>
              {snapshots.map((item) => (
                <p key={item.id}>
                  <strong>{item.id}</strong> · {item.actor} · {item.reason || 'no reason'}
                  {' '}
                  <button className="lp-button-secondary" type="button" onClick={() => copySnapshotIdValue(item.id)}>Copy ID</button>
                </p>
              ))}
            </div>
          </section>
        </div>

        <div className="lp-split">
          <section className="lp-panel">
            <h2 className="lp-panel-title">Current Policy Matrix</h2>
            <pre className="lp-code">{JSON.stringify(matrix, null, 2)}</pre>
          </section>

          <section className="lp-panel">
            <h2 className="lp-panel-title">Preview / Response</h2>
            <pre className="lp-code">{JSON.stringify(preview, null, 2)}</pre>
          </section>
        </div>

        <div className="lp-split">
          <section className="lp-panel">
            <h2 className="lp-panel-title">Policy Admin Audit</h2>
            {exports.policy?.rootHash ? (
              <div className="lp-actions lp-actions-tight">
                <button className="lp-button-secondary" type="button" onClick={() => copyAuditRootHash('policy')}>Copy Root Hash</button>
              </div>
            ) : null}
            <div className="lp-list">
              {policyAudit.map((item, index) => (
                <p key={`${item.at}-${index}`}>{item.at} · {item.actor} · {item.action}</p>
              ))}
            </div>
            {exports.policy ? <pre className="lp-code">{JSON.stringify(exports.policy, null, 2)}</pre> : null}
          </section>

          <section className="lp-panel">
            <h2 className="lp-panel-title">Access Audit & Alerts</h2>
            {exports.access?.rootHash ? (
              <div className="lp-actions lp-actions-tight">
                <button className="lp-button-secondary" type="button" onClick={() => copyAuditRootHash('access')}>Copy Root Hash</button>
              </div>
            ) : null}
            <div className="lp-list">
              {accessAudit.map((item, index) => (
                <p key={`${item.at}-${index}`}>{item.at} · {item.covenant}/{item.policyKey} · {item.decision} · {item.userId || 'anon'}</p>
              ))}
            </div>
            {alerts.length ? (
              <div className="lp-mini-card">
                {alerts.map((item) => (
                  <p key={item.covenant}>{item.covenant}: {item.denyCount} denies in {item.windowMinutes}m</p>
                ))}
              </div>
            ) : null}
            {exports.access ? <pre className="lp-code">{JSON.stringify(exports.access, null, 2)}</pre> : null}
          </section>
        </div>
      </div>
    </main>
  );
}