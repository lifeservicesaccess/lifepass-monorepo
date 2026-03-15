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

const API_BASE_URL = 'http://10.0.2.2:3003';

function toArray(csv) {
  return String(csv || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function App() {
  const [userId, setUserId] = useState(`mobile_${Date.now()}`);
  const [accessMode, setAccessMode] = useState('api-key');
  const [credential, setCredential] = useState('');
  const [legalName, setLegalName] = useState('');
  const [covenantName, setCovenantName] = useState('');
  const [purposeStatement, setPurposeStatement] = useState('');
  const [skills, setSkills] = useState('builder, learner');
  const [callings, setCallings] = useState('service');
  const [docs, setDocs] = useState('national-id');
  const [guideMessage, setGuideMessage] = useState('What should I do next?');
  const [guideReply, setGuideReply] = useState('');
  const [milestoneTitle, setMilestoneTitle] = useState('Finish first verified step');
  const [journey, setJourney] = useState(null);
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const endpoint = useMemo(() => `${API_BASE_URL}/onboarding/signup`, []);

  function authHeaders() {
    if (!credential) return {};
    if (accessMode === 'token') {
      return { Authorization: `Bearer ${credential}` };
    }
    return { 'x-api-key': credential };
  }

  async function readJson(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, options);
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || response.status);
    }
    return data;
  }

  async function submitSignup() {
    setSubmitting(true);
    setStatus('Submitting signup...');
    try {
      const payload = {
        userId,
        legalName,
        covenantName,
        purposeStatement,
        skills: toArray(skills),
        callings: toArray(callings),
        verificationDocs: toArray(docs)
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setStatus(`Signup failed: ${data.error || response.status}`);
      } else {
        setJourney(data);
        setStatus(`Signup submitted. Trust tier: ${data.trust?.level || 'Bronze'}`);
      }
    } catch (err) {
      setStatus(`Signup error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function askGuide() {
    try {
      setStatus('Asking guide...');
      const data = await readJson('/ai/chat', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId, message: guideMessage })
      });
      setGuideReply(data.result?.text || 'No guide response');
      setStatus(`Guide recommends ${data.result?.recommendedPortal || 'commons'}.`);
    } catch (err) {
      setGuideReply(`Guide error: ${err.message}`);
    }
  }

  async function loadJourney() {
    try {
      setStatus('Loading dashboard...');
      const data = await readJson(`/users/${encodeURIComponent(userId)}/dashboard`, {
        method: 'GET',
        headers: authHeaders()
      });
      setJourney(data);
      setStatus('Loaded milestones, badges, and trust snapshot.');
    } catch (err) {
      setStatus(`Dashboard error: ${err.message}`);
    }
  }

  async function createMilestone() {
    try {
      setStatus('Saving milestone...');
      await readJson(`/users/${encodeURIComponent(userId)}/milestones`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify({ title: milestoneTitle, status: 'pending' })
      });
      await loadJourney();
    } catch (err) {
      setStatus(`Milestone error: ${err.message}`);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>LifePass Mobile Onboarding</Text>
        <Text style={styles.subtitle}>M1 profile capture with Bronze trust initialization</Text>

        <View style={styles.form}>
          <TextInput style={styles.input} value={credential} onChangeText={setCredential} placeholder={accessMode === 'token' ? 'Bearer token' : 'API key'} />
          <TextInput style={styles.input} value={accessMode} onChangeText={setAccessMode} placeholder="api-key or token" />
          <TextInput style={styles.input} value={userId} onChangeText={setUserId} placeholder="User ID" />
          <TextInput style={styles.input} value={legalName} onChangeText={setLegalName} placeholder="Legal name" />
          <TextInput style={styles.input} value={covenantName} onChangeText={setCovenantName} placeholder="Covenant name (optional)" />
          <TextInput style={styles.input} value={purposeStatement} onChangeText={setPurposeStatement} placeholder="Purpose statement" />
          <TextInput style={styles.input} value={skills} onChangeText={setSkills} placeholder="Skills (comma-separated)" />
          <TextInput style={styles.input} value={callings} onChangeText={setCallings} placeholder="Callings (comma-separated)" />
          <TextInput style={styles.input} value={docs} onChangeText={setDocs} placeholder="Verification docs (comma-separated)" />

          <TouchableOpacity
            style={[styles.button, submitting ? styles.buttonDisabled : null]}
            onPress={submitSignup}
            disabled={submitting}
          >
            <Text style={styles.buttonText}>{submitting ? 'Submitting...' : 'Submit Signup'}</Text>
          </TouchableOpacity>

          {submitting ? <ActivityIndicator size="small" color="#0f766e" style={styles.loader} /> : null}
          {status ? <Text style={styles.status}>{status}</Text> : null}
          <Text style={styles.hint}>Android emulator uses 10.0.2.2 to reach local API on port 3003.</Text>

          <TextInput style={styles.input} value={guideMessage} onChangeText={setGuideMessage} placeholder="Ask the guide" />
          <TouchableOpacity style={styles.secondaryButton} onPress={askGuide}>
            <Text style={styles.secondaryButtonText}>Ask Guide</Text>
          </TouchableOpacity>
          {guideReply ? <Text style={styles.status}>{guideReply}</Text> : null}

          <TextInput style={styles.input} value={milestoneTitle} onChangeText={setMilestoneTitle} placeholder="New milestone title" />
          <View style={styles.inlineRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={createMilestone}>
              <Text style={styles.secondaryButtonText}>Add Milestone</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={loadJourney}>
              <Text style={styles.secondaryButtonText}>Load Journey</Text>
            </TouchableOpacity>
          </View>

          {journey ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Journey Snapshot</Text>
              <Text style={styles.cardLine}>Trust: {journey.trust?.level || 'Bronze'}</Text>
              <Text style={styles.cardLine}>Completed milestones: {journey.milestoneSummary?.completed || 0}</Text>
              <Text style={styles.cardLine}>Badges: {(journey.badges || []).map((badge) => badge.name).join(', ') || 'none yet'}</Text>
              {(journey.milestones || []).map((milestone) => (
                <Text key={milestone.id} style={styles.cardLine}>{milestone.title} · {milestone.status}</Text>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  container: {
    padding: 20
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a'
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#475569'
  },
  form: {
    marginTop: 16,
    gap: 10
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  button: {
    marginTop: 8,
    backgroundColor: '#0f766e',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center'
  },
  buttonDisabled: {
    opacity: 0.7
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600'
  },
  secondaryButton: {
    marginTop: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    paddingHorizontal: 12
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontWeight: '600'
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap'
  },
  loader: {
    marginTop: 10
  },
  status: {
    marginTop: 8,
    color: '#0f172a'
  },
  card: {
    marginTop: 12,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 12
  },
  cardTitle: {
    fontWeight: '700',
    color: '#0f172a'
  },
  cardLine: {
    marginTop: 4,
    color: '#334155'
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748b'
  }
});