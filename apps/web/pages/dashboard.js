import React, { useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
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

function apiTargetLabel() {
  const configured = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  if (configured) return configured;

  if (process.env.NODE_ENV === 'development') {
    const rewriteTarget = normalizeBaseUrl(process.env.LOCAL_API_BASE_URL || 'http://localhost:3003');
    return `relative paths (dev rewrite -> ${rewriteTarget})`;
  }

  return 'relative paths (same origin)';
}

function formatDateTimeLocal(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

export default function DashboardPage() {
  const [userId, setUserId] = useState('');
  const [accessMode, setAccessMode] = useState('api-key');
  const [credential, setCredential] = useState('');
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [visibility, setVisibility] = useState({
    legalName: false,
    covenantName: true,
    purposeStatement: true,
    skills: true,
    callings: true,
    trustLevel: true,
    milestones: true,
    biometricPhoto: false
  });
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDescription, setMilestoneDescription] = useState('');
  const [milestoneStatus, setMilestoneStatus] = useState('pending');
  const [anchorHolderAddress, setAnchorHolderAddress] = useState('');
  const [anchorMetadataUri, setAnchorMetadataUri] = useState('');
  const [editingMilestoneId, setEditingMilestoneId] = useState('');
  const [editMilestoneTitle, setEditMilestoneTitle] = useState('');
  const [editMilestoneDescription, setEditMilestoneDescription] = useState('');
  const [editMilestoneDueAt, setEditMilestoneDueAt] = useState('');
  const [editMilestoneTags, setEditMilestoneTags] = useState('');
  const apiTarget = apiTargetLabel();

  function requestHeaders() {
    if (!credential) return {};
    if (accessMode === 'token') {
      return { Authorization: `Bearer ${credential}` };
    }
    return { 'x-api-key': credential };
  }

  async function loadDashboard() {
    if (!userId.trim()) {
      setStatus('Enter a user ID, then load the snapshot.');
      setData(null);
      return;
    }
    if (!credential.trim()) {
      setStatus(accessMode === 'token'
        ? 'Paste a bearer token, then load the snapshot.'
        : 'Paste an API key, then load the snapshot.');
      setData(null);
      return;
    }

    try {
      setStatus('Loading...');
      const res = await axios.get(apiPath(`/users/${encodeURIComponent(userId)}/dashboard`), {
        headers: requestHeaders()
      });
      if (res.data?.success) {
        setData(res.data);
        setVisibility({
          legalName: Boolean(res.data.profile?.visibility?.legalName),
          covenantName: res.data.profile?.visibility?.covenantName !== false,
          purposeStatement: res.data.profile?.visibility?.purposeStatement !== false,
          skills: res.data.profile?.visibility?.skills !== false,
          callings: res.data.profile?.visibility?.callings !== false,
          trustLevel: res.data.profile?.visibility?.trustLevel !== false,
          milestones: res.data.profile?.visibility?.milestones !== false,
          biometricPhoto: Boolean(res.data.profile?.visibility?.biometricPhoto)
        });
        setAnchorHolderAddress(String(res.data.profile?.walletAddress || ''));
        setStatus('Loaded profile and trust snapshot.');
      } else {
        setStatus(res.data?.error || 'Failed to load dashboard');
      }
    } catch (err) {
      const backendError = err?.response?.data?.error;
      const statusCode = err?.response?.status;
      setStatus(`Dashboard error${statusCode ? ` [${statusCode}]` : ''}: ${backendError || err.message}`);
      setData(null);
    }
  }

  function handleLookupKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      loadDashboard();
    }
  }

  function updateVisibilityField(field, value) {
    setVisibility((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function saveVisibility() {
    if (!userId.trim() || !credential.trim()) {
      setStatus('Load a profile first, then save visibility settings.');
      return;
    }

    try {
      setStatus('Saving visibility settings...');
      const res = await axios.patch(apiPath(`/users/${encodeURIComponent(userId)}/visibility`), {
        visibility
      }, {
        headers: requestHeaders()
      });

      if (res.data?.success) {
        setData((current) => current ? {
          ...current,
          profile: {
            ...current.profile,
            visibility: res.data.visibility
          }
        } : current);
        setStatus('Visibility settings saved.');
      } else {
        setStatus(res.data?.error || 'Visibility update failed');
      }
    } catch (err) {
      const backendError = err?.response?.data?.error;
      setStatus(`Visibility error: ${backendError || err.message}`);
    }
  }

  async function createMilestone() {
    if (!userId.trim() || !credential.trim()) {
      setStatus('Load a profile first, then create a milestone.');
      return;
    }
    if (!milestoneTitle.trim()) {
      setStatus('Enter a milestone title first.');
      return;
    }

    try {
      setStatus('Creating milestone...');
      const res = await axios.post(apiPath(`/users/${encodeURIComponent(userId)}/milestones`), {
        title: milestoneTitle.trim(),
        description: milestoneDescription.trim(),
        status: milestoneStatus
      }, {
        headers: requestHeaders()
      });

      if (res.data?.success) {
        setMilestoneTitle('');
        setMilestoneDescription('');
        setMilestoneStatus('pending');
        await loadDashboard();
        setStatus('Milestone created.');
      } else {
        setStatus(res.data?.error || 'Milestone create failed');
      }
    } catch (err) {
      const backendError = err?.response?.data?.error;
      setStatus(`Milestone error: ${backendError || err.message}`);
    }
  }

  async function updateMilestoneState(milestoneId, nextStatus) {
    try {
      setStatus(`Updating milestone to ${nextStatus}...`);
      const payload = {
        status: nextStatus,
        completedAt: nextStatus === 'completed' ? new Date().toISOString() : null
      };
      const res = await axios.patch(apiPath(`/users/${encodeURIComponent(userId)}/milestones/${encodeURIComponent(milestoneId)}`), payload, {
        headers: requestHeaders()
      });

      if (res.data?.success) {
        await loadDashboard();
        setStatus(`Milestone marked ${nextStatus}.`);
      } else {
        setStatus(res.data?.error || 'Milestone update failed');
      }
    } catch (err) {
      const backendError = err?.response?.data?.error;
      setStatus(`Milestone update error: ${backendError || err.message}`);
    }
  }

  async function anchorMilestone(milestoneId) {
    if (!userId.trim() || !credential.trim()) {
      setStatus('Load a profile first, then anchor a milestone.');
      return;
    }

    try {
      setStatus('Anchoring milestone...');
      const payload = {
        holderAddress: anchorHolderAddress.trim() || undefined,
        metadataUri: anchorMetadataUri.trim() || undefined
      };
      const res = await axios.post(apiPath(`/users/${encodeURIComponent(userId)}/milestones/${encodeURIComponent(milestoneId)}/anchor`), payload, {
        headers: requestHeaders()
      });

      if (res.data?.success) {
        await loadDashboard();
        setStatus(`Milestone anchored${res.data.anchor?.txHash ? `: ${res.data.anchor.txHash}` : '.'}`);
      } else {
        setStatus(res.data?.error || 'Milestone anchor failed');
      }
    } catch (err) {
      const backendError = err?.response?.data?.error;
      const backendReason = err?.response?.data?.reason;
      setStatus(`Milestone anchor error: ${backendError || backendReason || err.message}`);
    }
  }

  function startMilestoneEdit(milestone) {
    setEditingMilestoneId(milestone.id);
    setEditMilestoneTitle(milestone.title || '');
    setEditMilestoneDescription(milestone.description || '');
    setEditMilestoneDueAt(formatDateTimeLocal(milestone.dueAt));
    setEditMilestoneTags(Array.isArray(milestone.tags) ? milestone.tags.join(', ') : '');
  }

  function cancelMilestoneEdit() {
    setEditingMilestoneId('');
    setEditMilestoneTitle('');
    setEditMilestoneDescription('');
    setEditMilestoneDueAt('');
    setEditMilestoneTags('');
  }

  async function saveMilestoneEdit(milestoneId) {
    if (!userId.trim() || !credential.trim()) {
      setStatus('Load a profile first, then edit a milestone.');
      return;
    }
    if (!editMilestoneTitle.trim()) {
      setStatus('Milestone title cannot be empty.');
      return;
    }

    try {
      setStatus('Saving milestone details...');
      const dueAt = editMilestoneDueAt ? new Date(editMilestoneDueAt).toISOString() : null;
      const tags = editMilestoneTags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      const payload = {
        title: editMilestoneTitle.trim(),
        description: editMilestoneDescription.trim(),
        dueAt,
        tags
      };
      const res = await axios.patch(apiPath(`/users/${encodeURIComponent(userId)}/milestones/${encodeURIComponent(milestoneId)}`), payload, {
        headers: requestHeaders()
      });

      if (res.data?.success) {
        cancelMilestoneEdit();
        await loadDashboard();
        setStatus('Milestone details saved.');
      } else {
        setStatus(res.data?.error || 'Milestone edit failed');
      }
    } catch (err) {
      const backendError = err?.response?.data?.error;
      setStatus(`Milestone edit error: ${backendError || err.message}`);
    }
  }

  return (
    <main className="lp-page">
      <div className="lp-shell">
        <span className="lp-kicker">Trust Lens</span>
        <h1 className="lp-title">LifePass Dashboard</h1>
        <p className="lp-subtitle">Fetch a user snapshot to inspect profile, trust level, and mint readiness context.</p>

        <div className="lp-nav">
          <Link href="/">Mint Portal</Link>
          <Link href="/signup">Onboarding</Link>
          <Link href="/admin">Admin Console</Link>
        </div>

        <div className="lp-badge">
          <span className="font-semibold">API target:</span>{' '}
          <span className="lp-mono">{apiTarget}</span>
        </div>

        <section className="lp-panel">
          <h2 className="lp-panel-title">Lookup</h2>
          <p className="lp-subtitle">Paste your API key or bearer token, enter the user ID, then click Load Snapshot or press Enter.</p>
          <div className="lp-grid lp-grid-2" style={{ marginTop: '0.76rem' }}>
            <div>
              <label className="lp-label" htmlFor="dashboardUserId">User ID</label>
              <input
                id="dashboardUserId"
                className="lp-input"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                onKeyDown={handleLookupKeyDown}
                placeholder="Enter userId"
              />
            </div>
            <div className="lp-actions" style={{ alignItems: 'end', marginTop: 0 }}>
              <button className="lp-button" onClick={loadDashboard} disabled={!userId.trim() || !credential.trim()}>Load Snapshot</button>
            </div>
            <div>
              <label className="lp-label" htmlFor="dashboardAccessMode">Access mode</label>
              <select id="dashboardAccessMode" className="lp-select" value={accessMode} onChange={(e) => setAccessMode(e.target.value)}>
                <option value="api-key">API key</option>
                <option value="token">Bearer token</option>
              </select>
            </div>
            <div>
              <label className="lp-label" htmlFor="dashboardCredential">Credential</label>
              <input
                id="dashboardCredential"
                className="lp-input"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                onKeyDown={handleLookupKeyDown}
                placeholder={accessMode === 'token' ? 'Paste LifePass bearer token' : 'Paste API key'}
              />
            </div>
          </div>
          {status ? <p className="lp-status">{status}</p> : null}
        </section>

        {data ? (
          <section className="lp-panel">
            <h2 className="lp-panel-title">Snapshot</h2>
            <div className="lp-kv">
              <p><span>Name:</span>{data.profile?.name || 'N/A'}</p>
              <p><span>Purpose:</span>{data.profile?.purpose || 'N/A'}</p>
              <p><span>Verification:</span>{data.profile?.verificationStatus || 'N/A'}</p>
              <p><span>Trust score:</span>{data.trust?.score}</p>
              <p><span>Trust level:</span>{data.trust?.level}</p>
              <p><span>Reason:</span>{data.trust?.reason}</p>
            </div>
            <div className="lp-meta-grid">
              <div className="lp-chip">Completed: {data.milestoneSummary?.completed || 0}</div>
              <div className="lp-chip">In progress: {data.milestoneSummary?.inProgress || 0}</div>
              <div className="lp-chip">Pending: {data.milestoneSummary?.pending || 0}</div>
            </div>
            {Array.isArray(data.badges) && data.badges.length > 0 ? (
              <div className="lp-meta-grid">
                {data.badges.map((badge) => (
                  <div key={badge.code} className="lp-chip">{badge.name}</div>
                ))}
              </div>
            ) : null}
            {data.profile?.visibility ? (
              <div className="lp-list" style={{ marginTop: '0.8rem' }}>
                <p>Visible on pass: {Object.entries(data.profile.visibility).filter(([, enabled]) => enabled).map(([key]) => key).join(', ') || 'none'}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {data ? (
          <section className="lp-panel">
            <h2 className="lp-panel-title">Privacy Controls</h2>
            <p className="lp-subtitle">Choose which attributes should remain visible on the pass and dashboard surfaces.</p>
            <div className="lp-grid lp-grid-2" style={{ marginTop: '0.8rem' }}>
              {[
                ['legalName', 'Legal name'],
                ['covenantName', 'Covenant name'],
                ['purposeStatement', 'Purpose statement'],
                ['skills', 'Skills'],
                ['callings', 'Callings'],
                ['trustLevel', 'Trust level'],
                ['milestones', 'Milestones'],
                ['biometricPhoto', 'Biometric photo']
              ].map(([key, label]) => (
                <label key={key} className="lp-inline-check" style={{ marginTop: 0 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(visibility[key])}
                    onChange={(e) => updateVisibilityField(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="lp-actions">
              <button className="lp-button-secondary" onClick={saveVisibility}>Save Visibility</button>
            </div>
          </section>
        ) : null}

        {data ? (
          <section className="lp-panel">
            <h2 className="lp-panel-title">Purpose Milestones</h2>
            <p className="lp-subtitle">Create and advance milestones so the guide and trust layer have real progress context.</p>
            <div className="lp-grid lp-grid-3" style={{ marginTop: '0.8rem' }}>
              <div>
                <label className="lp-label" htmlFor="milestoneTitle">Title</label>
                <input id="milestoneTitle" className="lp-input" value={milestoneTitle} onChange={(e) => setMilestoneTitle(e.target.value)} placeholder="Launch community food hub" />
              </div>
              <div>
                <label className="lp-label" htmlFor="milestoneStatus">Initial status</label>
                <select id="milestoneStatus" className="lp-select" value={milestoneStatus} onChange={(e) => setMilestoneStatus(e.target.value)}>
                  <option value="pending">pending</option>
                  <option value="in_progress">in progress</option>
                  <option value="completed">completed</option>
                </select>
              </div>
              <div>
                <label className="lp-label" htmlFor="milestoneDescription">Description</label>
                <input id="milestoneDescription" className="lp-input" value={milestoneDescription} onChange={(e) => setMilestoneDescription(e.target.value)} placeholder="Optional context" />
              </div>
            </div>
            <div className="lp-actions">
              <button className="lp-button" onClick={createMilestone}>Add Milestone</button>
            </div>

            <div className="lp-grid lp-grid-2" style={{ marginTop: '0.8rem' }}>
              <div>
                <label className="lp-label" htmlFor="anchorHolderAddress">Anchor holder address</label>
                <input
                  id="anchorHolderAddress"
                  className="lp-input"
                  value={anchorHolderAddress}
                  onChange={(e) => setAnchorHolderAddress(e.target.value)}
                  placeholder="Uses profile wallet if present"
                />
              </div>
              <div>
                <label className="lp-label" htmlFor="anchorMetadataUri">Anchor metadata URI</label>
                <input
                  id="anchorMetadataUri"
                  className="lp-input"
                  value={anchorMetadataUri}
                  onChange={(e) => setAnchorMetadataUri(e.target.value)}
                  placeholder="ipfs://... or https://..."
                />
              </div>
            </div>

            {Array.isArray(data.milestones) && data.milestones.length > 0 ? (
              <div className="lp-list" style={{ marginTop: '0.9rem' }}>
                {data.milestones.map((milestone) => (
                  <div key={milestone.id} className="lp-mini-card" style={{ marginTop: 0 }}>
                    <p><strong>{milestone.title}</strong> · {milestone.status}</p>
                    {milestone.description ? <p>{milestone.description}</p> : null}
                    {milestone.dueAt ? <p>Due: {new Date(milestone.dueAt).toLocaleString()}</p> : null}
                    {Array.isArray(milestone.tags) && milestone.tags.length > 0 ? <p>Tags: {milestone.tags.join(', ')}</p> : null}
                    <div className="lp-actions lp-actions-tight">
                      <button className="lp-button-secondary" type="button" onClick={() => startMilestoneEdit(milestone)}>Edit</button>
                      <button className="lp-button-secondary" type="button" onClick={() => updateMilestoneState(milestone.id, 'pending')}>Set Pending</button>
                      <button className="lp-button-secondary" type="button" onClick={() => updateMilestoneState(milestone.id, 'in_progress')}>Set In Progress</button>
                      <button className="lp-button-secondary" type="button" onClick={() => updateMilestoneState(milestone.id, 'completed')}>Mark Complete</button>
                      <button className="lp-button-secondary" type="button" onClick={() => anchorMilestone(milestone.id)} disabled={milestone.status !== 'completed'}>Anchor</button>
                    </div>
                    {editingMilestoneId === milestone.id ? (
                      <div className="lp-grid lp-grid-2" style={{ marginTop: '0.8rem' }}>
                        <div>
                          <label className="lp-label" htmlFor={`edit-title-${milestone.id}`}>Edit title</label>
                          <input
                            id={`edit-title-${milestone.id}`}
                            className="lp-input"
                            value={editMilestoneTitle}
                            onChange={(e) => setEditMilestoneTitle(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="lp-label" htmlFor={`edit-due-${milestone.id}`}>Due at</label>
                          <input
                            id={`edit-due-${milestone.id}`}
                            className="lp-input"
                            type="datetime-local"
                            value={editMilestoneDueAt}
                            onChange={(e) => setEditMilestoneDueAt(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="lp-label" htmlFor={`edit-description-${milestone.id}`}>Description</label>
                          <input
                            id={`edit-description-${milestone.id}`}
                            className="lp-input"
                            value={editMilestoneDescription}
                            onChange={(e) => setEditMilestoneDescription(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="lp-label" htmlFor={`edit-tags-${milestone.id}`}>Tags</label>
                          <input
                            id={`edit-tags-${milestone.id}`}
                            className="lp-input"
                            value={editMilestoneTags}
                            onChange={(e) => setEditMilestoneTags(e.target.value)}
                            placeholder="service, community, trust"
                          />
                        </div>
                        <div className="lp-actions lp-actions-tight">
                          <button className="lp-button" type="button" onClick={() => saveMilestoneEdit(milestone.id)}>Save Details</button>
                          <button className="lp-button-secondary" type="button" onClick={cancelMilestoneEdit}>Cancel</button>
                        </div>
                      </div>
                    ) : null}
                    {milestone.metadata?.onchainAnchor ? (
                      <div className="lp-list" style={{ marginTop: '0.7rem' }}>
                        <p>Anchor tx: {milestone.metadata.onchainAnchor.txHash || 'pending'}</p>
                        <p>Holder: {milestone.metadata.onchainAnchor.holderAddress || 'N/A'}</p>
                        <p>Mode: {milestone.metadata.onchainAnchor.simulated ? 'simulated' : 'live'}</p>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="lp-subtitle" style={{ marginTop: '0.8rem' }}>No milestones yet. Add one to start shaping the purpose journey.</p>
            )}
          </section>
        ) : null}

        {userId.trim() ? <GuideChat userId={userId.trim()} /> : null}
      </div>
    </main>
  );
}
