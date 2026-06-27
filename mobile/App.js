import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

// ---------------------------------------------------------------------------
// Config — update API_BASE to your backend URL (local dev or Railway)
// ---------------------------------------------------------------------------
const API_BASE = 'http://10.0.2.2:8000'; // Android emulator -> host machine
// For physical device on same WiFi: const API_BASE = 'http://192.168.x.x:8000';

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function WelcomeScreen({ onBegin }) {
  const [inputToken, setInputToken] = useState('');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.heroCard}>
        <Text style={styles.logoText}>HireFlow</Text>
        <Text style={styles.heroTitle}>Async Video Interview</Text>
        <Text style={styles.heroSubtitle}>
          You have been shortlisted! Complete your interview at your own pace —
          record answers to each question whenever you are ready.
        </Text>
        <View style={styles.stepRow}>
          {['Watch', 'Record', 'Submit'].map((step, i) => (
            <View key={step} style={styles.step}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepNum}>{i + 1}</Text>
              </View>
              <Text style={styles.stepLabel}>{step}</Text>
            </View>
          ))}
        </View>
        <TextInput 
          style={styles.input}
          placeholder="Paste interview token here..."
          placeholderTextColor="#666"
          value={inputToken}
          onChangeText={setInputToken}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.primaryBtn} onPress={() => onBegin(inputToken)}>
          <Text style={styles.primaryBtnText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function InterviewScreen({ token, onBack }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/interviews/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((e) => setState({ loading: false, error: e.message, data: null }));
  }, [token]);

  if (state.loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={PURPLE} />
        <Text style={styles.loadingText}>Loading your interview…</Text>
      </SafeAreaView>
    );
  }

  if (state.error) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <Text style={styles.errorEmoji}>⚠️</Text>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMsg}>{state.error}</Text>
        <Text style={styles.errorHint}>Check that your link is correct and try again.</Text>
        <TouchableOpacity style={[styles.primaryBtn, {marginTop: 24}]} onPress={onBack}>
          <Text style={styles.primaryBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const { data } = state;
  const questions = data?.questions ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={{marginBottom: 16}}>
           <Text style={{color: PURPLE, fontWeight: '600'}}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTag}>INTERVIEW</Text>
        <Text style={styles.headerJob}>{data?.job?.title ?? 'Position'}</Text>
        <Text style={styles.headerName}>Hi, {data?.candidate?.name ?? 'Candidate'} 👋</Text>
      </View>

      <FlatList
        data={questions}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.questionList}
        ListHeaderComponent={
          <Text style={styles.sectionTitle}>
            {questions.length} Questions
          </Text>
        }
        renderItem={({ item, index }) => (
          <View style={styles.questionCard}>
            <View style={styles.questionBadge}>
              <Text style={styles.questionNum}>{index + 1}</Text>
            </View>
            <Text style={styles.questionText}>{item}</Text>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={styles.footerNote}>
              Questions are listed below. 
              {'\n'}Recording is enabled once your interviewer activates it.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Root App — handles deep link parsing and screen routing
// ---------------------------------------------------------------------------

export default function App() {
  const [screen, setScreen] = useState('welcome'); // 'welcome' | 'interview'
  const [token, setToken] = useState(null);

  // Parse deep link: hireflow://interview/{token} or http://localhost/interview/{token}
  function handleUrl(url) {
    if (!url) return;
    try {
      const parsed = new URL(url);
      
      // Native deep link: scheme: hireflow, host: interview, pathname: /{token}
      // Web URL: pathname: /interview/{token}
      if (parsed.hostname === 'interview' || parsed.pathname.startsWith('/interview/')) {
        const t = parsed.pathname.replace(/^\/interview\//, '').replace(/^\//, '');
        if (t) {
          setToken(t);
          setScreen('interview');
        }
      }
    } catch {
      // malformed URL — ignore
    }
  }

  useEffect(() => {
    // Handle deep link when app is already open
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    // Handle deep link that cold-started the app
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    return () => sub.remove();
  }, []);

  if (screen === 'interview' && token) {
    return <InterviewScreen token={token} onBack={() => {
      setToken(null);
      setScreen('welcome');
    }} />;
  }

  return <WelcomeScreen onBegin={(t) => {
    if (t) {
      setToken(t.trim());
      setScreen('interview');
    } else if (token) {
      setScreen('interview');
    } else {
      alert("Please enter a token or use a valid deep link.");
    }
  }} />;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const PURPLE = '#6c47ff';
const DARK = '#0f0e1a';
const CARD = '#1a1830';
const TEXT = '#e8e8f0';
const MUTED = '#9999bb';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },

  // Welcome
  heroCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  logoText: {
    fontSize: 14,
    fontWeight: '700',
    color: PURPLE,
    letterSpacing: 4,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: TEXT,
    textAlign: 'center',
    marginBottom: 16,
  },
  heroSubtitle: {
    fontSize: 15,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  stepRow: { flexDirection: 'row', gap: 24, marginBottom: 48 },
  step: { alignItems: 'center', gap: 8 },
  stepBadge: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: PURPLE,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNum: { color: '#fff', fontWeight: '700', fontSize: 16 },
  stepLabel: { color: MUTED, fontSize: 12, fontWeight: '600' },
  input: {
    backgroundColor: CARD,
    color: TEXT,
    width: '100%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2840',
  },
  primaryBtn: {
    backgroundColor: PURPLE,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Interview header
  header: {
    backgroundColor: CARD,
    padding: 24,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2840',
  },
  headerTag: {
    fontSize: 11, fontWeight: '700', color: PURPLE,
    letterSpacing: 3, marginBottom: 6,
  },
  headerJob: { fontSize: 20, fontWeight: '800', color: TEXT, marginBottom: 4 },
  headerName: { fontSize: 14, color: MUTED },

  // Questions
  questionList: { padding: 16, gap: 12 },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: MUTED,
    letterSpacing: 1, marginBottom: 8,
  },
  questionCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  questionBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: PURPLE,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  questionNum: { color: '#fff', fontWeight: '700', fontSize: 13 },
  questionText: { flex: 1, color: TEXT, fontSize: 15, lineHeight: 22 },

  // Loading / Error
  loadingText: { color: MUTED, marginTop: 16, fontSize: 15 },
  errorEmoji: { fontSize: 48, marginBottom: 16 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: TEXT, marginBottom: 8 },
  errorMsg: { color: '#ff6b6b', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  errorHint: { color: MUTED, fontSize: 13, textAlign: 'center' },

  // Footer
  footer: { paddingVertical: 24, alignItems: 'center' },
  footerNote: { color: MUTED, fontSize: 13, textAlign: 'center', lineHeight: 20 },
});

