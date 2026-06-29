import { useEffect, useState, useRef } from 'react';
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
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as ExpoLinking from 'expo-linking';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
// Use the environment variable if set, otherwise fallback to local IP.
// IMPORTANT: 192.168.x.x only works while your phone and laptop are on the
// SAME wifi network as your backend. Before submitting/building the APK,
// set EXPO_PUBLIC_API_URL to your deployed Railway URL in mobile/.env —
// otherwise the evaluator's phone cannot reach your backend at all.
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.29.216:8000';
const CHUNK_SIZE = 1024 * 1024; // ~1MB binary chunks (see ALIGNED_B64_CHUNK below)

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function WelcomeScreen({ onBegin }) {
  const [inputToken, setInputToken] = useState('');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.heroCard}>
        <Text style={styles.logoText}>HireFlow</Text>
        <Text style={styles.heroTitle}>Async Video Interview</Text>
        <Text style={styles.heroSubtitle}>
          You have been shortlisted! Complete your interview at your own pace —
          record answers to each question whenever you are ready.
        </Text>
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
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [currentQIndex, setCurrentQIndex] = useState(-1);
  const [responses, setResponses] = useState([]);
  const checkpointFile = FileSystem.documentDirectory + `checkpoint_${token}.json`;

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

  // Load checkpoint when the user starts the interview
  const startInterview = async () => {
    if (!camPermission?.granted) await requestCamPermission();
    if (!micPermission?.granted) await requestMicPermission();
    
    try {
      const fileInfo = await FileSystem.getInfoAsync(checkpointFile);
      if (fileInfo.exists) {
        const content = await FileSystem.readAsStringAsync(checkpointFile);
        const data = JSON.parse(content);
        setResponses(data.responses || []);
        setCurrentQIndex(data.currentQIndex + 1 || 0);
        return;
      }
    } catch (e) {
      console.warn('Failed to load checkpoint:', e);
    }
    setCurrentQIndex(0);
  };

  const handleNext = async (responseMeta) => {
    const newResponses = [...responses, responseMeta];
    setResponses(newResponses);
    const nextIndex = currentQIndex + 1;
    setCurrentQIndex(nextIndex);
    
    try {
      await FileSystem.writeAsStringAsync(checkpointFile, JSON.stringify({
        currentQIndex: nextIndex,
        responses: newResponses
      }));
    } catch (e) {
      console.warn('Failed to save checkpoint:', e);
    }
  };

  if (state.loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={PRIMARY} />
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
        <TouchableOpacity style={[styles.primaryBtn, {marginTop: 24}]} onPress={onBack}>
          <Text style={styles.primaryBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const { data } = state;
  const questions = data?.questions ?? [];

  if (currentQIndex === -1) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerJob}>{data?.job?.title ?? 'Position'}</Text>
          <Text style={styles.headerName}>Hi, {data?.candidate?.name ?? 'Candidate'}</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.sectionTitle}>{questions.length} Questions</Text>
          <Text style={{color: TEXT, marginBottom: 20, textAlign: 'center'}}>
            You will have 30 seconds to think before each question, and up to 3 minutes to answer.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={startInterview}>
            <Text style={styles.primaryBtnText}>Start Interview</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (currentQIndex >= questions.length) {
    return <CompletionScreen token={token} responses={responses} onBack={async () => {
      // Clear checkpoint when finished
      try {
        const fileInfo = await FileSystem.getInfoAsync(checkpointFile);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(checkpointFile);
        }
      } catch (e) {}
      onBack();
    }} />;
  }

  return (
    <RecordingScreen 
      key={currentQIndex}
      token={token}
      question={questions[currentQIndex]}
      questionIndex={currentQIndex}
      totalQuestions={questions.length}
      onNext={handleNext}
    />
  );
}

function RecordingScreen({ token, question, questionIndex, totalQuestions, onNext }) {
  const [phase, setPhase] = useState('think'); // 'think', 'record', 'upload'
  const [timeLeft, setTimeLeft] = useState(30);
  const cameraRef = useRef(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    let timer;
    if (phase === 'think' && timeLeft > 0) {
      timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    } else if (phase === 'think' && timeLeft === 0) {
      startRecording();
    } else if (phase === 'record' && timeLeft > 0) {
      timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    } else if (phase === 'record' && timeLeft === 0) {
      stopRecording();
    }
    return () => clearTimeout(timer);
  }, [phase, timeLeft]);

  const startRecording = async () => {
    if (cameraRef.current) {
      // Start recording async, but don't await it so our timer can run
      setPhase('record');
      setTimeLeft(180); // 3 minutes max
      cameraRef.current.recordAsync({ 
        maxDuration: 180,
        videoQuality: '480p'
      }).then(video => {
        if (video) {
          uploadVideo(video.uri);
        }
      }).catch(e => {
        console.error(e);
        Alert.alert("Recording Error", "Could not record video. Please try again.");
        setPhase('think');
        setTimeLeft(30);
      });
    }
  };

  const stopRecording = () => {
    if (cameraRef.current && phase === 'record') {
      cameraRef.current.stopRecording();
    }
  };

  const uploadVideo = async (uri) => {
    setPhase('upload');
    try {
      // Read the entire file as Base64 once to avoid repeated slow disk reads/seeks
      const fullBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const totalLength = fullBase64.length;

      // BUG FIX: base64 encodes 3 raw bytes -> 4 text characters. The chunk
      // boundary MUST land on a multiple of 4 characters, otherwise each
      // chunk is not independently decodable and base64.b64decode() on the
      // backend throws "Invalid base64-encoded string" / "Incorrect padding"
      // for almost every chunk except the very first. That silent 500 is why
      // chunks were failing. Flooring to a multiple of 4 fixes this.
      const RAW_B64_CHUNK_SIZE = Math.ceil(CHUNK_SIZE * 4 / 3);
      const BASE64_CHUNK_SIZE = Math.floor(RAW_B64_CHUNK_SIZE / 4) * 4;
      const totalChunks = Math.ceil(totalLength / BASE64_CHUNK_SIZE);

      // True resume support: ask the backend how many bytes of THIS question's
      // video it already has on disk (e.g. from a previous attempt that died
      // mid-upload), and start from the matching chunk instead of byte 0.
      let startChunk = 0;
      try {
        const statusRes = await fetch(
          `${API_BASE}/api/interviews/${token}/upload-status?question_index=${questionIndex}`
        );
        if (statusRes.ok) {
          const { bytes_received } = await statusRes.json();
          if (bytes_received > 0) {
            // Each chunk's *decoded* size is BASE64_CHUNK_SIZE/4*3 bytes
            // (the last chunk may be smaller, but resume always targets a
            // full prior chunk boundary so this division is exact).
            const bytesPerChunk = (BASE64_CHUNK_SIZE / 4) * 3;
            startChunk = Math.floor(bytes_received / bytesPerChunk);
          }
        }
      } catch (e) {
        // Status check failing just means we restart from 0 — not fatal.
        console.warn('Could not check upload status, starting from scratch:', e);
      }

      for (let i = startChunk; i < totalChunks; i++) {
        let success = false;
        let retries = 0;
        const start = i * BASE64_CHUNK_SIZE;
        const end = Math.min(start + BASE64_CHUNK_SIZE, totalLength);
        const chunkBase64 = fullBase64.substring(start, end);

        while (!success && retries < 3) {
          try {
            const res = await fetch(`${API_BASE}/api/interviews/${token}/upload-chunk`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                question_index: questionIndex,
                chunk_index: i,
                total_chunks: totalChunks,
                data: chunkBase64
              })
            });

            if (!res.ok) {
              const errBody = await res.json().catch(() => ({}));
              throw new Error(errBody.detail || `Upload failed (${res.status})`);
            }
            success = true;
            setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
          } catch (err) {
            console.error(`Chunk ${i} upload attempt ${retries + 1} failed:`, err);
            retries++;
            if (retries >= 3) throw err;
            await new Promise(r => setTimeout(r, 2000)); // wait 2s before retry
          }
        }
      }

      onNext({ question_index: questionIndex, status: 'uploaded' });

    } catch (e) {
      console.error("Video upload failed:", e);
      Alert.alert(
        "Upload Failed",
        `We couldn't finish uploading this answer (${e.message || e}). Check your connection — when you retry, the upload will resume from where it left off, not from the start.`
      );
      setPhase('think');
      setTimeLeft(30);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTag}>Question {questionIndex + 1} / {totalQuestions}</Text>
        <Text style={{color: TEXT, fontSize: 16, marginTop: 10}}>{question}</Text>
      </View>
      <View style={{flex: 1, backgroundColor: '#000'}}>
        {phase !== 'upload' && (
          <View style={{flex: 1, position: 'relative'}}>
            <CameraView 
              ref={cameraRef} 
              style={StyleSheet.absoluteFill} 
              mode="video"
              facing="front"
              mute={false}
            />
            <View style={{flex: 1, justifyContent: 'flex-end', padding: 20, zIndex: 10}}>
              {phase === 'think' && (
                <View style={styles.overlayBox}>
                  <Text style={styles.overlayTitle}>Think Time</Text>
                  <Text style={styles.overlayTime}>{timeLeft}s</Text>
                  <TouchableOpacity style={styles.primaryBtn} onPress={startRecording}>
                    <Text style={styles.primaryBtnText}>Start Answering</Text>
                  </TouchableOpacity>
                </View>
              )}
              {phase === 'record' && (
                <View style={styles.overlayBox}>
                  <Text style={[styles.overlayTitle, {color: '#ff4444'}]}>● Recording</Text>
                  <Text style={styles.overlayTime}>{timeLeft}s left</Text>
                  <TouchableOpacity style={[styles.primaryBtn, {backgroundColor: '#ff4444'}]} onPress={stopRecording}>
                    <Text style={styles.primaryBtnText}>Finish Answer</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}
        {phase === 'upload' && (
          <View style={[styles.center, {flex: 1}]}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={{color: TEXT, marginTop: 20}}>Uploading answer... {uploadProgress}%</Text>
            <Text style={{color: MUTED, marginTop: 10, textAlign: 'center'}}>
              If you lose connection, the upload will resume where it left off.
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function CompletionScreen({ token, responses, onBack }) {
  const [submitting, setSubmitting] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/interviews/${token}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responses })
    })
    .then(r => {
      if (!r.ok) throw new Error('Failed to complete interview');
      setSubmitting(false);
    })
    .catch(e => {
      setError(e.message);
      setSubmitting(false);
    });
  }, [token, responses]);

  if (submitting) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={PRIMARY} />
        <Text style={{color: TEXT, marginTop: 20}}>Finalizing interview...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, styles.center]}>
      {error ? (
        <>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>Submission Error</Text>
          <Text style={styles.errorMsg}>{error}</Text>
        </>
      ) : (
        <>
          <Text style={{fontSize: 48, marginBottom: 16}}>🎉</Text>
          <Text style={styles.heroTitle}>Interview Complete</Text>
          <Text style={styles.heroSubtitle}>Thank you for your time. Your answers have been recorded.</Text>
        </>
      )}
      <TouchableOpacity style={styles.primaryBtn} onPress={onBack}>
        <Text style={styles.primaryBtnText}>Return Home</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

export default function App() {
  const [screen, setScreen] = useState('welcome');
  const [token, setToken] = useState(null);

  function handleUrl(url) {
    if (!url) return;
    try {
      const parsed = ExpoLinking.parse(url);
      // parsed.hostname === 'interview'
      // parsed.path === 'token'
      if (parsed.hostname === 'interview') {
        let t = parsed.path;
        if (t) {
          // Remove any trailing slashes just in case
          t = t.replace(/\/$/, '');
          setToken(t);
          setScreen('interview');
        }
      } else if (parsed.path && parsed.path.includes('interview/')) {
        // Fallback if parsed weirdly
        const t = parsed.path.split('interview/')[1];
        if (t) {
          setToken(t);
          setScreen('interview');
        }
      }
    } catch (e) {
      console.warn("Error parsing deep link:", e);
    }
  }

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
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
    } else {
      Alert.alert("Error", "Please enter a token");
    }
  }} />;
}

const PRIMARY = '#fc8a40';
const LIGHT = '#f9f9ff';
const CARD = '#ffffff';
const TEXT = '#151c27';
const MUTED = '#45474a';
const DIVIDER = '#dce2f3';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LIGHT },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  heroCard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: CARD, margin: 16, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 20, elevation: 2, borderWidth: 1, borderColor: DIVIDER },
  logoText: { fontSize: 24, fontWeight: '800', color: '#000', letterSpacing: -0.5, marginBottom: 16 },
  heroTitle: { fontSize: 28, fontWeight: '800', color: TEXT, textAlign: 'center', marginBottom: 16, letterSpacing: -0.5 },
  heroSubtitle: { fontSize: 16, color: MUTED, textAlign: 'center', lineHeight: 24, marginBottom: 40 },
  input: { backgroundColor: '#f9f9ff', color: TEXT, width: '100%', padding: 16, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: DIVIDER, fontSize: 16 },
  primaryBtn: { backgroundColor: PRIMARY, paddingVertical: 16, paddingHorizontal: 48, borderRadius: 16, width: '100%', alignItems: 'center', shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 4 },
  primaryBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  header: { backgroundColor: CARD, padding: 24, paddingTop: 16, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  headerTag: { fontSize: 13, fontWeight: '700', color: PRIMARY, letterSpacing: 1, marginBottom: 6 },
  headerJob: { fontSize: 20, fontWeight: '800', color: TEXT, marginBottom: 4 },
  headerName: { fontSize: 14, color: MUTED },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: MUTED, letterSpacing: 1, marginBottom: 8 },
  loadingText: { color: MUTED, marginTop: 16, fontSize: 15 },
  errorEmoji: { fontSize: 48, marginBottom: 16 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: TEXT, marginBottom: 8 },
  errorMsg: { color: '#ff6b6b', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  overlayBox: { backgroundColor: 'rgba(255,255,255,0.9)', padding: 20, borderRadius: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  overlayTitle: { color: TEXT, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  overlayTime: { color: TEXT, fontSize: 32, fontWeight: '800', marginBottom: 20 },
});
