import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';

const CHUNK_SIZE = 1024 * 1024; // 1MB

// ── Phase Components ──────────────────────────────────────────────────────

function WelcomeScreen({ interviewData, onBegin }) {
  const candidateName = interviewData?.candidate_name || 'there';
  const jobTitle = interviewData?.job_title || 'this role';
  const totalQuestions = interviewData?.questions?.length || 0;

  return (
    <div className="min-h-screen bg-[#f9f9ff] text-[#151c27] font-[Inter,sans-serif] antialiased flex flex-col relative overflow-x-hidden">
      {/* Ambient blobs */}
      <div className="fixed inset-0 overflow-hidden z-0 pointer-events-none">
        <div style={{ animation: 'gentlePulse 15s infinite ease-in-out', filter: 'blur(80px)' }}
          className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-[#fc8a40] opacity-20 mix-blend-multiply" />
        <div style={{ animation: 'gentlePulse 15s infinite ease-in-out', animationDelay: '-5s', filter: 'blur(80px)' }}
          className="absolute bottom-[-20%] left-[-10%] w-[700px] h-[700px] rounded-full bg-[#e7eefe] opacity-40 mix-blend-multiply" />
      </div>

      <main className="flex-grow flex flex-col items-center justify-center px-5 md:px-16 py-12 max-w-[1280px] mx-auto w-full relative z-10">
        {/* Header */}
        <header className="w-full max-w-3xl mb-12 text-center">
          <h2 className="text-[24px] font-black tracking-tight text-black mb-2">HireFlow</h2>
          <h1 className="text-[40px] md:text-[56px] font-black leading-[1.1] tracking-tight text-black">
            Welcome, <span className="text-[#9b4500]">{candidateName}.</span>
          </h1>
          <p className="text-[18px] text-[#45474a] mt-3">
            You have <span className="font-semibold text-black">{totalQuestions} questions</span> for the <span className="font-semibold text-black">{jobTitle}</span> position.
          </p>
        </header>

        {/* Bento Grid */}
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Primary Card */}
          <div className="md:col-span-8 rounded-[24px] p-8 md:p-10 flex flex-col justify-between relative overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 8px 32px rgba(0,0,0,0.04)' }}>
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-[#e2e8f8] rounded-full opacity-50 transition-transform duration-700 hover:scale-110" />
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-full bg-[#dce2f3] flex items-center justify-center text-black mb-6">
                <span className="material-symbols-outlined">videocam</span>
              </div>
              <h3 className="text-[32px] font-bold leading-[1.2] tracking-[-0.01em] text-black mb-3">
                Your interview is ready.
              </h3>
              <p className="text-[18px] text-[#45474a] mb-8 max-w-xl leading-[1.6]">
                You'll answer {totalQuestions} async video questions at your own pace. Each question gives you time to think before recording begins.
              </p>
              <button
                onClick={onBegin}
                className="w-full sm:w-auto rounded-[16px] px-8 py-4 text-[14px] font-semibold tracking-[0.05em] flex items-center justify-center gap-2 transition-colors duration-300"
                style={{ background: '#fc8a40', color: '#672c00', boxShadow: '0 4px 20px rgba(252,138,64,0.3)' }}
              >
                <span className="material-symbols-outlined">play_arrow</span>
                Begin Interview
              </button>
            </div>
            <div className="mt-8 pt-6 border-t border-[#dce2f3]/50 relative z-10 flex items-center gap-3">
              <span className="material-symbols-outlined text-[#76777b]">info</span>
              <span className="text-[16px] text-[#45474a]">Camera & microphone access required</span>
            </div>
          </div>

          {/* Stats Card */}
          <div className="md:col-span-4 bg-white rounded-[24px] p-8 flex flex-col items-center text-center justify-center gap-4"
            style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
            <div className="w-16 h-16 rounded-full bg-[#e7eefe] flex items-center justify-center">
              <span className="material-symbols-outlined text-[32px] text-black">mic</span>
            </div>
            <div>
              <div className="text-[48px] font-black text-black leading-none">{totalQuestions}</div>
              <div className="text-[12px] font-semibold tracking-[0.05em] text-[#45474a] uppercase mt-1">Questions</div>
            </div>
            <div className="w-full h-px bg-[#dce2f3]" />
            <div className="text-[14px] text-[#45474a] leading-[1.6]">
              ~3 minutes per answer.<br />Complete at your own pace.
            </div>
          </div>

          {/* Precautions */}
          <div className="md:col-span-12 mt-4">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-[#9b4500]">self_improvement</span>
              <h2 className="text-[24px] font-semibold text-black">Before we begin</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: 'favorite', title: 'Take a breath', text: "Interviews can be stressful. Take your time, pause when needed, and just breathe. There are no trick questions here." },
                { icon: 'history_edu', title: 'We value your story', text: "Your unique experiences make you valuable. Don't worry about 'perfect' answers — we prefer authenticity and genuine reflections." },
                { icon: 'wifi_tethering', title: 'Tech checks', text: "If your connection drops or your dog barks, it's completely okay. Life happens. Just rejoin when you can." },
              ].map((p, i) => (
                <div key={i} className="bg-white rounded-[24px] p-8 hover:shadow-md transition-shadow duration-300"
                  style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
                  <div className="w-10 h-10 rounded-full bg-[#e7eefe] flex items-center justify-center text-black mb-5">
                    <span className="material-symbols-outlined">{p.icon}</span>
                  </div>
                  <h4 className="text-[14px] font-semibold tracking-[0.05em] text-black mb-2">{p.title}</h4>
                  <p className="text-[16px] text-[#45474a] leading-[1.6]">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes gentlePulse {
          0%   { transform: scale(1)    translate(0,0);      opacity: 0.5; }
          33%  { transform: scale(1.05) translate(10px,-10px); opacity: 0.6; }
          66%  { transform: scale(0.95) translate(-10px,10px); opacity: 0.4; }
          100% { transform: scale(1)    translate(0,0);      opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

function ThinkScreen({ question, questionIndex, totalQuestions, timeLeft, onStartNow }) {
  return (
    <div className="h-screen bg-[#f9f9ff] text-[#151c27] font-[Inter,sans-serif] antialiased flex flex-col overflow-hidden">
      {/* Header */}
      <header className="w-full flex justify-between items-center px-5 md:px-16 py-6">
        <div className="flex items-center gap-2 px-3 py-1 bg-[#e7eefe] rounded-full">
          <span className="text-[12px] font-semibold tracking-[0.05em] text-[#45474a] uppercase">
            Question {questionIndex + 1} of {totalQuestions}
          </span>
        </div>
        <div className="text-[24px] font-black tracking-tight text-black">HireFlow</div>
        <div className="w-24" />
      </header>

      {/* Main */}
      <main className="flex-grow flex flex-col items-center justify-center px-5 md:px-16 max-w-[1280px] mx-auto w-full">
        <div className="text-center mb-8">
          <span className="inline-block px-3 py-1 rounded-full bg-[#e2e8f8] text-[#45474a] text-[12px] font-medium uppercase tracking-widest mb-4">
            Think Time
          </span>
          <p className="text-[16px] text-[#45474a] max-w-lg mx-auto">
            Gather your thoughts. Recording starts automatically or tap below when ready.
          </p>
        </div>

        {/* Question */}
        <div className="text-center max-w-3xl mb-16">
          <h1 className="text-[40px] md:text-[56px] font-black leading-[1.1] tracking-tight text-black">
            {question}
          </h1>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-6">
          <div className="text-[32px] font-mono tabular-nums font-bold text-[#45474a]">
            {String(timeLeft).padStart(2, '0')}s
          </div>
          <button
            onClick={onStartNow}
            className="group relative flex items-center justify-center w-24 h-24 rounded-full transition-transform duration-300 hover:scale-105"
            style={{ background: '#fc8a40', boxShadow: '0 4px 20px rgba(252,138,64,0.3)' }}
            aria-label="Start Recording"
          >
            <span className="material-symbols-outlined text-4xl text-[#672c00]" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
          </button>
          <span className="text-[14px] font-semibold tracking-[0.05em] text-[#45474a]">Tap to Record Now</span>
        </div>
      </main>

      {/* Progress Footer */}
      <footer className="w-full px-5 md:px-16 pb-8">
        <div className="max-w-[1280px] mx-auto flex flex-col gap-2">
          <div className="flex justify-between text-[12px] font-medium text-[#45474a] uppercase tracking-widest">
            <span>Question {questionIndex + 1} of {totalQuestions}</span>
            <span>{Math.round((questionIndex / totalQuestions) * 100)}% Complete</span>
          </div>
          <div className="w-full h-1 bg-[#e2e8f8] rounded-full overflow-hidden">
            <div className="h-full bg-black rounded-full transition-all" style={{ width: `${(questionIndex / totalQuestions) * 100}%` }} />
          </div>
        </div>
      </footer>
    </div>
  );
}

function RecordScreen({ question, questionIndex, totalQuestions, timeString, videoRef, onStop }) {
  return (
    <div className="h-screen bg-[#f9f9ff] text-[#151c27] font-[Inter,sans-serif] antialiased flex flex-col overflow-hidden">
      {/* Header */}
      <header className="w-full flex justify-between items-center px-5 md:px-16 py-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-[#ffdad6]/40 rounded-full">
            <div className="w-2 h-2 bg-[#ba1a1a] rounded-full animate-pulse" />
            <span className="text-[#ba1a1a] text-[12px] font-semibold uppercase tracking-widest">Recording</span>
          </div>
          <div className="font-mono text-[24px] tabular-nums text-black font-bold">{timeString}</div>
        </div>
        <div className="text-[24px] font-black tracking-tight text-black">HireFlow</div>
        <div className="w-24" />
      </header>

      {/* Main */}
      <main className="flex-grow flex flex-col items-center justify-center px-5 md:px-16 max-w-[1280px] mx-auto w-full">
        {/* Question */}
        <div className="text-center max-w-3xl mb-8">
          <h1 className="text-[32px] md:text-[40px] font-black leading-[1.1] tracking-tight text-black">
            {question}
          </h1>
        </div>

        {/* Video + Controls */}
        <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
          <div className="relative w-full aspect-video bg-[#dce2f3] rounded-[24px] overflow-hidden border border-[#c6c6ca]" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            {/* Audio waves overlay */}
            <div className="absolute bottom-4 right-4 flex items-end gap-1 h-8 px-3 py-2 bg-black/40 backdrop-blur-md rounded-lg">
              {[0.5, 0.75, 1, 0.67].map((h, i) => (
                <div key={i} className="w-1 bg-white rounded-full"
                  style={{ height: `${h * 100}%`, animation: `audioWave ${0.8 + i * 0.2}s ease-in-out infinite alternate` }} />
              ))}
            </div>
          </div>
          <button
            onClick={onStop}
            className="flex items-center gap-3 px-8 py-4 bg-black text-white rounded-full text-[14px] font-semibold hover:scale-105 transition-transform"
            style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
            aria-label="Stop Recording"
          >
            <span className="material-symbols-outlined">stop_circle</span>
            Stop & Submit Answer
          </button>
        </div>
      </main>

      {/* Progress Footer */}
      <footer className="w-full px-5 md:px-16 pb-8">
        <div className="max-w-[1280px] mx-auto flex flex-col gap-2">
          <div className="flex justify-between text-[12px] font-medium text-[#45474a] uppercase tracking-widest">
            <span>Question {questionIndex + 1} of {totalQuestions}</span>
            <span>{Math.round((questionIndex / totalQuestions) * 100)}% Complete</span>
          </div>
          <div className="w-full h-1 bg-[#e2e8f8] rounded-full overflow-hidden">
            <div className="h-full bg-black rounded-full" style={{ width: `${(questionIndex / totalQuestions) * 100}%` }} />
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes audioWave {
          0%   { transform: scaleY(0.5); }
          100% { transform: scaleY(1.2); }
        }
      `}</style>
    </div>
  );
}

function UploadScreen({ uploadProgress }) {
  return (
    <div className="min-h-screen bg-[#f9f9ff] flex items-center justify-center font-[Inter,sans-serif]">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-black border-t-transparent rounded-full animate-spin mx-auto mb-6" />
        <p className="text-[24px] font-bold text-black mb-2">Saving your answer…</p>
        <p className="text-[16px] text-[#45474a] mb-6">Please do not close this tab.</p>
        <div className="w-64 h-2 bg-[#e2e8f8] rounded-full overflow-hidden mx-auto">
          <div className="h-full bg-black rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
        </div>
        <p className="text-[14px] text-[#45474a] mt-2">{uploadProgress}%</p>
      </div>
    </div>
  );
}

function CompleteScreen() {
  return (
    <div className="min-h-screen bg-[#f9f9ff] text-[#151c27] flex items-center justify-center font-[Inter,sans-serif] antialiased">
      <main className="w-full max-w-2xl px-5 md:px-0 mx-auto flex flex-col items-center text-center">
        {/* Success graphic */}
        <div className="relative w-48 h-48 mb-12 flex items-center justify-center">
          <div className="absolute inset-0 bg-[#ffdbc9] rounded-full blur-2xl opacity-60 mix-blend-multiply" />
          <svg className="w-full h-full relative z-10" fill="none" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" stroke="#c6c6ca" strokeDasharray="4 4" strokeWidth="2"
              style={{ animation: 'spin 20s linear infinite', transformOrigin: 'center' }} />
            <circle cx="50" cy="50" r="30" fill="#f9f9ff" />
            <path d="M50 20C66.57 20 80 33.43 80 50S66.57 80 50 80 20 66.57 20 50 33.43 20 50 20Z"
              fill="url(#grad)" />
            <path d="M38 52L46 60L64 42" stroke="#000000" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="3" />
            <defs>
              <linearGradient id="grad" x1="20" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
                <stop stopColor="#ffdbc9" />
                <stop offset="1" stopColor="#fc8a40" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <h1 className="text-[40px] md:text-[56px] font-black leading-[1.1] tracking-tight text-black mb-6">
          Interview Complete.
        </h1>
        <p className="text-[18px] text-[#45474a] max-w-md mx-auto mb-12 leading-[1.6]">
          Your story is being processed. Thank you for sharing your experience and professional journey with us.
        </p>
        <a href="/"
          className="inline-flex items-center justify-center px-8 py-4 bg-black text-white rounded-[16px] text-[14px] font-semibold hover:bg-[#1a1c1f] transition-colors duration-300"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
        >
          Return to Dashboard
          <span className="material-symbols-outlined ml-2 text-[18px]">arrow_forward</span>
        </a>

        <div className="mt-32 pt-12 border-t border-[#dce2f3] w-full flex flex-col items-center">
          <span className="text-[24px] font-black tracking-tight text-[#c6c6ca]">HireFlow</span>
        </div>
      </main>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function InterviewRecording() {
  const { token } = useParams();
  const [interviewData, setInterviewData] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [phase, setPhase] = useState('welcome'); // welcome | think | record | upload | complete
  const [timeLeft, setTimeLeft] = useState(30);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [responses, setResponses] = useState([]);

  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const streamRef = useRef(null);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/interviews/${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.questions?.length > 0) setInterviewData(data);
        else console.error('No questions found');
      })
      .catch(err => console.error(err));
    return () => stopCamera();
  }, [token]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.error('Camera error:', err);
      alert('Could not access camera and microphone. Please grant permissions.');
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
  };

  // Timer countdown
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

  const handleBeginInterview = async () => {
    await startCamera();
    setPhase('think');
    setTimeLeft(30);
  };

  const startRecording = () => {
    recordedChunksRef.current = [];
    if (!streamRef.current) { alert('Camera not ready.'); return; }
    const mediaRecorder = new MediaRecorder(streamRef.current);
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    mediaRecorder.onstop = () => uploadVideo();
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setPhase('record');
    setTimeLeft(180);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && phase === 'record') mediaRecorderRef.current.stop();
  };

  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const uploadVideo = async () => {
    setPhase('upload');
    const blob = new Blob(recordedChunksRef.current, { type: 'video/mp4' });
    const totalSize = blob.size;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE) || 1;

    try {
      for (let i = 0; i < totalChunks; i++) {
        const position = i * CHUNK_SIZE;
        const chunkBlob = blob.slice(position, position + Math.min(CHUNK_SIZE, totalSize - position));
        const chunkBase64 = await blobToBase64(chunkBlob);
        let success = false, retries = 0;

        while (!success && retries < 3) {
          try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/interviews/${token}/upload-chunk`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ question_index: currentQuestionIndex, chunk_index: i, total_chunks: totalChunks, data: chunkBase64 })
            });
            if (!res.ok) throw new Error('Upload failed');
            success = true;
            setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
          } catch (err) {
            retries++;
            if (retries >= 3) throw err;
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }

      const newResponses = [...responses, { question_index: currentQuestionIndex, status: 'uploaded' }];
      setResponses(newResponses);

      if (currentQuestionIndex < interviewData.questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        setPhase('think');
        setTimeLeft(30);
      } else {
        finishInterview(newResponses);
      }
    } catch (e) {
      alert('Could not upload the video. Please check your connection.');
      setPhase('think');
      setTimeLeft(30);
    }
  };

  const finishInterview = async (finalResponses) => {
    setPhase('complete');
    try {
      await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/interviews/${token}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses: finalResponses })
      });
      stopCamera();
    } catch (e) { console.error(e); }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (!interviewData) return (
    <div className="min-h-screen bg-[#f9f9ff] flex items-center justify-center font-[Inter,sans-serif]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-black border-t-transparent rounded-full animate-spin" />
        <p className="text-[#45474a] text-[16px]">Validating Interview Link…</p>
      </div>
    </div>
  );

  if (phase === 'welcome') return <WelcomeScreen interviewData={interviewData} onBegin={handleBeginInterview} />;
  if (phase === 'complete') return <CompleteScreen />;
  if (phase === 'upload') return <UploadScreen uploadProgress={uploadProgress} />;

  const currentQuestion = interviewData.questions[currentQuestionIndex];
  const totalQuestions = interviewData.questions.length;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  if (phase === 'think') return (
    <ThinkScreen
      question={currentQuestion}
      questionIndex={currentQuestionIndex}
      totalQuestions={totalQuestions}
      timeLeft={timeLeft}
      onStartNow={startRecording}
    />
  );

  if (phase === 'record') return (
    <RecordScreen
      question={currentQuestion}
      questionIndex={currentQuestionIndex}
      totalQuestions={totalQuestions}
      timeString={timeString}
      videoRef={videoRef}
      onStop={stopRecording}
    />
  );
}
