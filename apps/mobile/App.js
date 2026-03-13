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
  const [legalName, setLegalName] = useState('');
  const [covenantName, setCovenantName] = useState('');
  const [purposeStatement, setPurposeStatement] = useState('');
  const [skills, setSkills] = useState('builder, learner');
  const [callings, setCallings] = useState('service');
  const [docs, setDocs] = useState('national-id');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const endpoint = useMemo(() => `${API_BASE_URL}/onboarding/signup`, []);

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
        setStatus(`Signup submitted. Trust tier: ${data.trust?.level || 'Bronze'}`);
      }
    } catch (err) {
      setStatus(`Signup error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>LifePass Mobile Onboarding</Text>
        <Text style={styles.subtitle}>M1 profile capture with Bronze trust initialization</Text>

        <View style={styles.form}>
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
  loader: {
    marginTop: 10
  },
  status: {
    marginTop: 8,
    color: '#0f172a'
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748b'
  }
});