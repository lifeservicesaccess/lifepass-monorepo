import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

const DEFAULT_API_BASE_URL = 'http://10.0.2.2:3003';

const SAMPLE_POLICY = JSON.stringify({
  health: {
    ageGatedServices: { minTrustLevel: 'bronze', audience: 'zionstack-portals' }
  }
}, null, 2);

const VISIBILITY_FIELDS = [
  ['legalName', 'Legal name'],
  ['covenantName', 'Covenant name'],
  ['purposeStatement', 'Purpose statement'],
  ['skills', 'Skills'],
  ['callings', 'Callings'],
  ['trustLevel', 'Trust level'],
  ['milestones', 'Milestones'],
  ['biometricPhoto', 'Biometric photo']
];

function toArray(csv) {
  return String(csv || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function apiPath(baseUrl, pathname) {
  return `${normalizeBaseUrl(baseUrl)}${pathname}`;
}

function formatDateTimeLocal(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function prettyJson(value) {
  if (!value) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch (_err) {
    return String(value);
  }
}

function buildApprovalMessage(proposal) {
  if (!proposal) return '';
  return `${proposal.id}:${proposal.action}:${proposal.payloadHash}`;
}

function getHealthCheck(health, checkName) {
  return (health?.checks || []).find((item) => item.check === checkName) || null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('onboarding');
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [apiKey, setApiKey] = useState('');
  const [userId, setUserId] = useState(`mobile_${Date.now()}`);
  const [sessionToken, setSessionToken] = useState('');
  const [legalName, setLegalName] = useState('');
  const [covenantName, setCovenantName] = useState('');
  const [purposeStatement, setPurposeStatement] = useState('');
  const [skills, setSkills] = useState('builder, learner');
  const [callings, setCallings] = useState('service');
  const [docs, setDocs] = useState('national-id');
  const [verifierName, setVerifierName] = useState('');
  const [verifierType, setVerifierType] = useState('church');
  const [endorsement, setEndorsement] = useState('');
  const [guideMessage, setGuideMessage] = useState('What should I do next?');
  const [guideReply, setGuideReply] = useState('');
  const [journey, setJourney] = useState(null);
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
  const [milestoneTitle, setMilestoneTitle] = useState('Finish first verified step');
  const [milestoneDescription, setMilestoneDescription] = useState('');
  const [milestoneStatus, setMilestoneStatus] = useState('pending');
  const [anchorHolderAddress, setAnchorHolderAddress] = useState('');
  const [anchorMetadataUri, setAnchorMetadataUri] = useState('');
  const [editingMilestoneId, setEditingMilestoneId] = useState('');
  const [editMilestoneTitle, setEditMilestoneTitle] = useState('');
  const [editMilestoneDescription, setEditMilestoneDescription] = useState('');
  const [editMilestoneDueAt, setEditMilestoneDueAt] = useState('');
  const [editMilestoneTags, setEditMilestoneTags] = useState('');
  const [adminMode, setAdminMode] = useState('key');
  const [adminCredential, setAdminCredential] = useState('');
  const [adminKeyId, setAdminKeyId] = useState('current');
  const [adminActor, setAdminActor] = useState('governance-admin');
  const [adminReason, setAdminReason] = useState('mobile-governance-update');
  const [policyJson, setPolicyJson] = useState(SAMPLE_POLICY);
  const [replaceMode, setReplaceMode] = useState(false);
  const [proposalId, setProposalId] = useState('');
  const [approverId, setApproverId] = useState('');
  const [approvalSignature, setApprovalSignature] = useState('');
  const [snapshotId, setSnapshotId] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const [preview, setPreview] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [policyAudit, setPolicyAudit] = useState([]);
  const [accessAudit, setAccessAudit] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [auditExports, setAuditExports] = useState({ policy: null, access: null });

  const selectedProposal = useMemo(
    () => approvals.find((item) => item.id === proposalId) || null,
    [approvals, proposalId]
  );
  const approvalMessage = useMemo(() => buildApprovalMessage(selectedProposal), [selectedProposal]);
  const authModeCheck = useMemo(() => getHealthCheck(health, 'Policy admin auth mode'), [health]);
  const durableGovernanceCheck = useMemo(() => getHealthCheck(health, 'Durable governance storage'), [health]);
  const twoPersonCheck = useMemo(() => getHealthCheck(health, 'POLICY_TWO_PERSON_REQUIRED readiness'), [health]);

  function authHeaders(preferToken = true) {
    const headers = { Accept: 'application/json' };
    if (preferToken && sessionToken) {
      headers.Authorization = `Bearer ${sessionToken}`;
      return headers;
    }
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    return headers;
  }

  function adminHeaders() {
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

  async function readJson(pathname, options = {}) {
    const response = await fetch(apiPath(apiBaseUrl, pathname), options);
    const data = await response.json();
    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || data?.reason || response.status);
    }
    return data;
  }

  async function runAction(label, action) {
    setLoading(true);
    setStatus(`${label}...`);
    try {
      await action();
      setStatus(`${label} complete.`);
    } catch (err) {
      setStatus(`${label} failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  function syncJourneyState(data) {
    setJourney(data);
    setVisibility({
      legalName: Boolean(data.profile?.visibility?.legalName),
      covenantName: data.profile?.visibility?.covenantName !== false,
      purposeStatement: data.profile?.visibility?.purposeStatement !== false,
      skills: data.profile?.visibility?.skills !== false,
      callings: data.profile?.visibility?.callings !== false,
      trustLevel: data.profile?.visibility?.trustLevel !== false,
      milestones: data.profile?.visibility?.milestones !== false,
      biometricPhoto: Boolean(data.profile?.visibility?.biometricPhoto)
    });
    setAnchorHolderAddress(String(data.profile?.walletAddress || ''));
  }

  async function submitSignup() {
    await runAction('Submitting signup', async () => {
      const data = await readJson('/onboarding/signup', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          legalName,
          covenantName,
          purposeStatement,
          skills: toArray(skills),
          callings: toArray(callings),
          verificationDocs: toArray(docs)
        })
      });
      setSessionToken(data.session?.token || '');
      syncJourneyState({
        profile: data.profile || {},
        trust: data.trust || {},
        milestones: [],
        milestoneSummary: { completed: 0, inProgress: 0, pending: 0 },
        badges: []
      });
      setActiveTab('journey');
      setStatus(`Signup submitted. Trust tier: ${data.trust?.level || 'Bronze'}`);
    });
  }

  async function submitVerifier() {
    await runAction('Submitting verifier source', async () => {
      const data = await readJson('/onboarding/verifier-submission', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          verifierName,
          verifierType,
          endorsement
        })
      });
      setStatus(`Verifier submitted. Sources: ${data.verifierSubmissionsCount || 0}`);
    });
  }

  async function askGuide() {
    await runAction('Asking guide', async () => {
      const data = await readJson('/ai/chat', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId, message: guideMessage })
      });
      setGuideReply(data.result?.text || 'No guide response');
    });
  }

  async function loadJourney() {
    await runAction('Loading journey', async () => {
      const data = await readJson(`/users/${encodeURIComponent(userId)}/dashboard`, {
        method: 'GET',
        headers: authHeaders(true)
      });
      syncJourneyState(data);
    });
  }

  async function saveVisibility() {
    await runAction('Saving visibility', async () => {
      const data = await readJson(`/users/${encodeURIComponent(userId)}/visibility`, {
        method: 'PATCH',
        headers: {
          ...authHeaders(true),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ visibility })
      });
      setJourney((current) => current ? {
        ...current,
        profile: {
          ...current.profile,
          visibility: data.visibility
        }
      } : current);
    });
  }

  async function createMilestone() {
    await runAction('Creating milestone', async () => {
      await readJson(`/users/${encodeURIComponent(userId)}/milestones`, {
        method: 'POST',
        headers: {
          ...authHeaders(true),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: milestoneTitle,
          description: milestoneDescription,
          status: milestoneStatus
        })
      });
      await loadJourney();
    });
  }

  async function updateMilestoneState(milestoneId, nextStatus) {
    await runAction(`Updating milestone to ${nextStatus}`, async () => {
      await readJson(`/users/${encodeURIComponent(userId)}/milestones/${encodeURIComponent(milestoneId)}`, {
        method: 'PATCH',
        headers: {
          ...authHeaders(true),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: nextStatus,
          completedAt: nextStatus === 'completed' ? new Date().toISOString() : null
        })
      });
      await loadJourney();
    });
  }

  async function anchorMilestone(milestoneId) {
    await runAction('Anchoring milestone', async () => {
      const data = await readJson(`/users/${encodeURIComponent(userId)}/milestones/${encodeURIComponent(milestoneId)}/anchor`, {
        method: 'POST',
        headers: {
          ...authHeaders(true),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          holderAddress: anchorHolderAddress || undefined,
          metadataUri: anchorMetadataUri || undefined
        })
      });
      await loadJourney();
      setStatus(`Milestone anchored: ${data.anchor?.txHash || 'submitted'}`);
    });
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
    await runAction('Saving milestone details', async () => {
      await readJson(`/users/${encodeURIComponent(userId)}/milestones/${encodeURIComponent(milestoneId)}`, {
        method: 'PATCH',
        headers: {
          ...authHeaders(true),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: editMilestoneTitle,
          description: editMilestoneDescription,
          dueAt: editMilestoneDueAt ? new Date(editMilestoneDueAt).toISOString() : null,
          tags: toArray(editMilestoneTags)
        })
      });
      cancelMilestoneEdit();
      await loadJourney();
    });
  }

  function policyPayload() {
    return {
      matrix: JSON.parse(policyJson || '{}'),
      reason: adminReason,
      replace: replaceMode
    };
  }

  async function loadAdminConsole() {
    await runAction('Loading admin console', async () => {
      const headers = adminHeaders();
      const [healthData, matrixData, approvalsData, snapshotsData, policyAuditData, accessAuditData, alertData] = await Promise.all([
        readJson('/health'),
        readJson('/portals/policy-matrix', { method: 'GET', headers }),
        readJson('/portals/policy-approvals?limit=20', { method: 'GET', headers }),
        readJson('/portals/policy-snapshots?limit=20', { method: 'GET', headers }),
        readJson('/portals/policy-admin/audit?limit=20', { method: 'GET', headers }),
        readJson('/portals/access-audit?limit=20', { method: 'GET', headers }),
        readJson('/portals/access-audit/alerts?threshold=1&windowMinutes=1440', { method: 'GET', headers })
      ]);
      setHealth(healthData);
      setMatrix(matrixData.matrix || null);
      setApprovals(approvalsData.proposals || []);
      setSnapshots(snapshotsData.snapshots || []);
      setPolicyAudit(policyAuditData.events || []);
      setAccessAudit(accessAuditData.events || []);
      setAlerts(alertData.alerts || []);
    });
  }

  async function previewPolicyChange() {
    await runAction('Previewing policy change', async () => {
      const data = await readJson('/portals/policy-matrix/preview', {
        method: 'POST',
        headers: {
          ...adminHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(policyPayload())
      });
      setPreview(data);
    });
  }

  async function applyPolicyChange() {
    await runAction('Applying policy change', async () => {
      const data = await readJson('/portals/policy-matrix', {
        method: 'POST',
        headers: {
          ...adminHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(policyPayload())
      });
      setPreview(data);
      await loadAdminConsole();
    });
  }

  async function restorePolicySnapshot() {
    await runAction('Restoring snapshot', async () => {
      const data = await readJson(`/portals/policy-snapshots/${encodeURIComponent(snapshotId)}/restore`, {
        method: 'POST',
        headers: {
          ...adminHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: adminReason })
      });
      setPreview(data);
      await loadAdminConsole();
    });
  }

  async function approveProposal() {
    await runAction('Approving proposal', async () => {
      const data = await readJson(`/portals/policy-approvals/${encodeURIComponent(proposalId)}/approve`, {
        method: 'POST',
        headers: {
          ...adminHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ approverId, signature: approvalSignature })
      });
      setPreview(data);
      await loadAdminConsole();
    });
  }

  async function exportAudit(scope) {
    await runAction(`Exporting ${scope} audit`, async () => {
      const pathname = scope === 'policy' ? '/portals/policy-admin/audit/export' : '/portals/access-audit/export';
      const data = await readJson(pathname, { method: 'GET', headers: adminHeaders() });
      setAuditExports((current) => ({ ...current, [scope]: data.export || null }));
    });
  }

  function renderTabButton(tab, label) {
    const active = activeTab === tab;
    return (
      <TouchableOpacity
        key={tab}
        style={[styles.tabButton, active ? styles.tabButtonActive : null]}
        onPress={() => setActiveTab(tab)}
      >
        <Text style={[styles.tabButtonText, active ? styles.tabButtonTextActive : null]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  function renderOnboarding() {
    return (
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Identity Setup</Text>
        <Text style={styles.subtitle}>Build profile DNA, initialize trust, and add verifier sources.</Text>
        <TextInput style={styles.input} value={userId} onChangeText={setUserId} placeholder="User ID" />
        <TextInput style={styles.input} value={legalName} onChangeText={setLegalName} placeholder="Legal name" />
        <TextInput style={styles.input} value={covenantName} onChangeText={setCovenantName} placeholder="Covenant name" />
        <TextInput style={styles.input} value={purposeStatement} onChangeText={setPurposeStatement} placeholder="Purpose statement" />
        <TextInput style={styles.input} value={skills} onChangeText={setSkills} placeholder="Skills (comma-separated)" />
        <TextInput style={styles.input} value={callings} onChangeText={setCallings} placeholder="Callings (comma-separated)" />
        <TextInput style={styles.input} value={docs} onChangeText={setDocs} placeholder="Verification docs (comma-separated)" />
        <TouchableOpacity style={styles.primaryButton} onPress={submitSignup}>
          <Text style={styles.primaryButtonText}>Submit Signup</Text>
        </TouchableOpacity>

        <View style={styles.sectionDivider} />
        <Text style={styles.panelTitle}>Verification Source</Text>
        <TextInput style={styles.input} value={verifierName} onChangeText={setVerifierName} placeholder="Verifier name" />
        <TextInput style={styles.input} value={verifierType} onChangeText={setVerifierType} placeholder="Verifier type" />
        <TextInput style={styles.input} value={endorsement} onChangeText={setEndorsement} placeholder="Endorsement note" />
        <TouchableOpacity style={styles.secondaryButton} onPress={submitVerifier}>
          <Text style={styles.secondaryButtonText}>Submit Verifier</Text>
        </TouchableOpacity>

        <View style={styles.sectionDivider} />
        <Text style={styles.panelTitle}>Guide</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          multiline
          value={guideMessage}
          onChangeText={setGuideMessage}
          placeholder="Ask for next steps, trust-building ideas, or portal recommendations"
        />
        <TouchableOpacity style={styles.secondaryButton} onPress={askGuide}>
          <Text style={styles.secondaryButtonText}>Ask Guide</Text>
        </TouchableOpacity>
        {guideReply ? <Text style={styles.cardLine}>{guideReply}</Text> : null}
      </View>
    );
  }

  function renderVisibilityToggle(field, label) {
    const enabled = Boolean(visibility[field]);
    return (
      <TouchableOpacity
        key={field}
        style={[styles.toggleRow, enabled ? styles.toggleRowActive : null]}
        onPress={() => setVisibility((current) => ({ ...current, [field]: !current[field] }))}
      >
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleValue}>{enabled ? 'ON' : 'OFF'}</Text>
      </TouchableOpacity>
    );
  }

  function renderMilestoneCard(milestone) {
    const editing = editingMilestoneId === milestone.id;
    return (
      <View key={milestone.id} style={styles.card}>
        <Text style={styles.cardTitle}>{milestone.title} · {milestone.status}</Text>
        {milestone.description ? <Text style={styles.cardLine}>{milestone.description}</Text> : null}
        {milestone.dueAt ? <Text style={styles.cardLine}>Due: {new Date(milestone.dueAt).toLocaleString()}</Text> : null}
        {Array.isArray(milestone.tags) && milestone.tags.length > 0 ? <Text style={styles.cardLine}>Tags: {milestone.tags.join(', ')}</Text> : null}
        {milestone.metadata?.onchainAnchor?.txHash ? <Text style={styles.cardLine}>Anchor: {milestone.metadata.onchainAnchor.txHash}</Text> : null}
        <View style={styles.inlineRow}>
          <TouchableOpacity style={styles.chipButton} onPress={() => startMilestoneEdit(milestone)}>
            <Text style={styles.chipButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chipButton} onPress={() => updateMilestoneState(milestone.id, 'pending')}>
            <Text style={styles.chipButtonText}>Pending</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chipButton} onPress={() => updateMilestoneState(milestone.id, 'in_progress')}>
            <Text style={styles.chipButtonText}>In Progress</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chipButton} onPress={() => updateMilestoneState(milestone.id, 'completed')}>
            <Text style={styles.chipButtonText}>Complete</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chipButton, milestone.status !== 'completed' ? styles.buttonDisabled : null]}
            onPress={() => anchorMilestone(milestone.id)}
            disabled={milestone.status !== 'completed'}
          >
            <Text style={styles.chipButtonText}>Anchor</Text>
          </TouchableOpacity>
        </View>
        {editing ? (
          <View style={styles.editorBox}>
            <TextInput style={styles.input} value={editMilestoneTitle} onChangeText={setEditMilestoneTitle} placeholder="Edit title" />
            <TextInput style={styles.input} value={editMilestoneDescription} onChangeText={setEditMilestoneDescription} placeholder="Edit description" />
            <TextInput style={styles.input} value={editMilestoneDueAt} onChangeText={setEditMilestoneDueAt} placeholder="Due at (YYYY-MM-DDTHH:mm)" />
            <TextInput style={styles.input} value={editMilestoneTags} onChangeText={setEditMilestoneTags} placeholder="Tags (comma-separated)" />
            <View style={styles.inlineRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => saveMilestoneEdit(milestone.id)}>
                <Text style={styles.secondaryButtonText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={cancelMilestoneEdit}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  function renderJourney() {
    return (
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Journey Dashboard</Text>
        <Text style={styles.subtitle}>Profile snapshot, privacy controls, milestones, and guide actions from mobile.</Text>
        <TextInput style={styles.input} value={apiKey} onChangeText={setApiKey} placeholder="API key for lookup fallback or admin" />
        <TouchableOpacity style={styles.primaryButton} onPress={loadJourney}>
          <Text style={styles.primaryButtonText}>Load Journey</Text>
        </TouchableOpacity>

        {journey ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Snapshot</Text>
              <Text style={styles.cardLine}>Purpose: {journey.profile?.purpose || 'N/A'}</Text>
              <Text style={styles.cardLine}>Trust: {journey.trust?.level || 'Bronze'} ({journey.trust?.score ?? 'n/a'})</Text>
              <Text style={styles.cardLine}>Verification: {journey.profile?.verificationStatus || 'pending'}</Text>
              <Text style={styles.cardLine}>Badges: {(journey.badges || []).map((badge) => badge.name).join(', ') || 'none yet'}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Privacy Controls</Text>
              {VISIBILITY_FIELDS.map(([field, label]) => renderVisibilityToggle(field, label))}
              <TouchableOpacity style={styles.secondaryButton} onPress={saveVisibility}>
                <Text style={styles.secondaryButtonText}>Save Visibility</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Milestones</Text>
              <TextInput style={styles.input} value={milestoneTitle} onChangeText={setMilestoneTitle} placeholder="Milestone title" />
              <TextInput style={styles.input} value={milestoneDescription} onChangeText={setMilestoneDescription} placeholder="Milestone description" />
              <TextInput style={styles.input} value={milestoneStatus} onChangeText={setMilestoneStatus} placeholder="pending | in_progress | completed" />
              <TextInput style={styles.input} value={anchorHolderAddress} onChangeText={setAnchorHolderAddress} placeholder="Anchor holder wallet address" />
              <TextInput style={styles.input} value={anchorMetadataUri} onChangeText={setAnchorMetadataUri} placeholder="Anchor metadata URI" />
              <TouchableOpacity style={styles.secondaryButton} onPress={createMilestone}>
                <Text style={styles.secondaryButtonText}>Add Milestone</Text>
              </TouchableOpacity>
              {(journey.milestones || []).map(renderMilestoneCard)}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Guide</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                multiline
                value={guideMessage}
                onChangeText={setGuideMessage}
                placeholder="Ask guide from your live journey context"
              />
              <TouchableOpacity style={styles.secondaryButton} onPress={askGuide}>
                <Text style={styles.secondaryButtonText}>Ask Guide</Text>
              </TouchableOpacity>
              {guideReply ? <Text style={styles.cardLine}>{guideReply}</Text> : null}
            </View>
          </>
        ) : null}
      </View>
    );
  }

  function renderHealthChecks() {
    return (health?.checks || []).map((item) => (
      <View key={item.check} style={styles.healthRow}>
        <Text style={styles.healthCheck}>{item.check}</Text>
        <Text style={styles.healthStatus}>{String(item.status || '').toUpperCase()}</Text>
        <Text style={styles.cardLine}>{item.detail}</Text>
      </View>
    ));
  }

  function renderAdmin() {
    return (
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Governance Console</Text>
        <Text style={styles.subtitle}>Policy preview/apply, approvals, snapshots, audit exports, and live health from mobile.</Text>
        <TextInput style={styles.input} value={apiKey} onChangeText={setApiKey} placeholder="API key" />
        <TextInput style={styles.input} value={adminMode} onChangeText={setAdminMode} placeholder="Admin mode: key or jwt" />
        <TextInput style={styles.input} value={adminCredential} onChangeText={setAdminCredential} placeholder="Admin credential" />
        <TextInput style={styles.input} value={adminKeyId} onChangeText={setAdminKeyId} placeholder="Admin key ID" />
        <TextInput style={styles.input} value={adminActor} onChangeText={setAdminActor} placeholder="Admin actor" />
        <TouchableOpacity style={styles.primaryButton} onPress={loadAdminConsole}>
          <Text style={styles.primaryButtonText}>Load Console</Text>
        </TouchableOpacity>

        {health ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Health</Text>
            <Text style={styles.cardLine}>Mode: {health.mode}</Text>
            <Text style={styles.cardLine}>Version: {health.version || 'unknown'}</Text>
            <Text style={styles.cardLine}>Health schema: {health.healthSchemaVersion || 'unknown'}</Text>
            <Text style={styles.cardLine}>{authModeCheck?.detail || 'Admin auth mode unavailable'}</Text>
            <Text style={styles.cardLine}>{durableGovernanceCheck?.detail || 'Durable governance status unavailable'}</Text>
            <Text style={styles.cardLine}>{twoPersonCheck?.detail || 'Two-person execution status unavailable'}</Text>
            {renderHealthChecks()}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Policy Editor</Text>
          <TextInput style={styles.input} value={adminReason} onChangeText={setAdminReason} placeholder="Reason" />
          <TouchableOpacity style={styles.toggleRow} onPress={() => setReplaceMode((current) => !current)}>
            <Text style={styles.toggleLabel}>Replace mode</Text>
            <Text style={styles.toggleValue}>{replaceMode ? 'ON' : 'OFF'}</Text>
          </TouchableOpacity>
          <TextInput
            style={[styles.input, styles.codeInput]}
            multiline
            value={policyJson}
            onChangeText={setPolicyJson}
            placeholder="Policy JSON"
          />
          <View style={styles.inlineRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={previewPolicyChange}>
              <Text style={styles.secondaryButtonText}>Preview</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={applyPolicyChange}>
              <Text style={styles.secondaryButtonText}>Apply</Text>
            </TouchableOpacity>
          </View>
          {matrix ? <Text style={styles.codeText}>{prettyJson(matrix)}</Text> : null}
          {preview ? <Text style={styles.codeText}>{prettyJson(preview)}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Approvals</Text>
          <TextInput style={styles.input} value={proposalId} onChangeText={setProposalId} placeholder="Proposal ID" />
          <TextInput style={styles.input} value={approverId} onChangeText={setApproverId} placeholder="Approver ID" />
          <TextInput style={[styles.input, styles.multilineInput]} multiline value={approvalSignature} onChangeText={setApprovalSignature} placeholder="Approval signature" />
          {approvalMessage ? <Text style={styles.codeText}>{approvalMessage}</Text> : null}
          <TouchableOpacity style={styles.secondaryButton} onPress={approveProposal}>
            <Text style={styles.secondaryButtonText}>Approve Proposal</Text>
          </TouchableOpacity>
          {(approvals || []).map((proposal) => (
            <TouchableOpacity key={proposal.id} style={styles.card} onPress={() => setProposalId(proposal.id)}>
              <Text style={styles.cardTitle}>{proposal.action}</Text>
              <Text style={styles.cardLine}>{proposal.id}</Text>
              <Text style={styles.cardLine}>{proposal.status}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Snapshots</Text>
          <TextInput style={styles.input} value={snapshotId} onChangeText={setSnapshotId} placeholder="Snapshot ID" />
          <TouchableOpacity style={styles.secondaryButton} onPress={restorePolicySnapshot}>
            <Text style={styles.secondaryButtonText}>Restore Snapshot</Text>
          </TouchableOpacity>
          {(snapshots || []).map((snapshot) => (
            <TouchableOpacity key={snapshot.id} style={styles.card} onPress={() => setSnapshotId(snapshot.id)}>
              <Text style={styles.cardTitle}>{snapshot.id}</Text>
              <Text style={styles.cardLine}>{snapshot.reason || 'No reason'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Audit</Text>
          <View style={styles.inlineRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => exportAudit('policy')}>
              <Text style={styles.secondaryButtonText}>Export Policy Audit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => exportAudit('access')}>
              <Text style={styles.secondaryButtonText}>Export Access Audit</Text>
            </TouchableOpacity>
          </View>
          {auditExports.policy ? <Text style={styles.codeText}>{prettyJson(auditExports.policy)}</Text> : null}
          {auditExports.access ? <Text style={styles.codeText}>{prettyJson(auditExports.access)}</Text> : null}
          {(alerts || []).map((alert, index) => (
            <Text key={`${alert.covenant || 'alert'}-${index}`} style={styles.cardLine}>{prettyJson(alert)}</Text>
          ))}
          {(policyAudit || []).slice(0, 5).map((event, index) => (
            <Text key={`policy-audit-${index}`} style={styles.cardLine}>{event.action} · {event.actor}</Text>
          ))}
          {(accessAudit || []).slice(0, 5).map((event, index) => (
            <Text key={`access-audit-${index}`} style={styles.cardLine}>{event.decision} · {event.covenant} · {event.path}</Text>
          ))}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>LifePass Mobile</Text>
        <Text style={styles.hero}>Bring onboarding, journey controls, and governance into the handheld workflow.</Text>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Connection</Text>
          <TextInput style={styles.input} value={apiBaseUrl} onChangeText={setApiBaseUrl} placeholder="API base URL" />
          <Text style={styles.hint}>Default uses Android emulator loopback for the local API on port 3003.</Text>
          <View style={styles.tabRow}>
            {renderTabButton('onboarding', 'Onboarding')}
            {renderTabButton('journey', 'Journey')}
            {renderTabButton('admin', 'Admin')}
          </View>
        </View>

        {activeTab === 'onboarding' ? renderOnboarding() : null}
        {activeTab === 'journey' ? renderJourney() : null}
        {activeTab === 'admin' ? renderAdmin() : null}

        {loading ? <ActivityIndicator size="small" color="#c2410c" style={styles.loader} /> : null}
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f7efe5'
  },
  container: {
    padding: 20,
    gap: 14
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#7c2d12'
  },
  hero: {
    fontSize: 15,
    color: '#78350f'
  },
  panel: {
    backgroundColor: '#fffaf3',
    borderColor: '#fed7aa',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10,
    shadowColor: '#7c2d12',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 2
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#9a3412'
  },
  subtitle: {
    fontSize: 13,
    color: '#92400e'
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#fdba74',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#431407'
  },
  multilineInput: {
    minHeight: 92,
    textAlignVertical: 'top'
  },
  codeInput: {
    minHeight: 180,
    textAlignVertical: 'top',
    fontFamily: 'monospace'
  },
  primaryButton: {
    backgroundColor: '#c2410c',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center'
  },
  primaryButtonText: {
    color: '#fff7ed',
    fontWeight: '700'
  },
  secondaryButton: {
    backgroundColor: '#ffedd5',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: '#7c2d12',
    fontWeight: '700'
  },
  chipButton: {
    backgroundColor: '#fed7aa',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  chipButtonText: {
    color: '#7c2d12',
    fontWeight: '700',
    fontSize: 12
  },
  buttonDisabled: {
    opacity: 0.5
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4
  },
  tabButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fdba74',
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: '#fff7ed'
  },
  tabButtonActive: {
    backgroundColor: '#c2410c',
    borderColor: '#c2410c'
  },
  tabButtonText: {
    color: '#9a3412',
    fontWeight: '700'
  },
  tabButtonTextActive: {
    color: '#fff7ed'
  },
  inlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 14,
    padding: 12,
    gap: 6
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7c2d12'
  },
  cardLine: {
    color: '#431407',
    fontSize: 13
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#fdba74'
  },
  toggleRowActive: {
    backgroundColor: '#ffedd5'
  },
  toggleLabel: {
    color: '#7c2d12',
    fontWeight: '600'
  },
  toggleValue: {
    color: '#9a3412',
    fontWeight: '800'
  },
  editorBox: {
    marginTop: 6,
    gap: 8
  },
  healthRow: {
    borderTopWidth: 1,
    borderTopColor: '#ffedd5',
    paddingTop: 8,
    marginTop: 4,
    gap: 4
  },
  healthCheck: {
    color: '#7c2d12',
    fontWeight: '700'
  },
  healthStatus: {
    color: '#c2410c',
    fontWeight: '800'
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#431407',
    backgroundColor: '#fff7ed',
    borderRadius: 12,
    padding: 10
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#fed7aa',
    marginVertical: 6
  },
  hint: {
    color: '#9a3412',
    fontSize: 12
  },
  loader: {
    marginTop: 8
  },
  status: {
    color: '#7c2d12',
    fontWeight: '600',
    fontSize: 13,
    marginBottom: 12
  }
});