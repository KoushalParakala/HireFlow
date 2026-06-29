import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const CHUNK_SIZE = 1024 * 1024; // 1MB

export default function InterviewRecording() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [interviewData, setInterviewData] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  
  const [phase, setPhase] = useState('think'); // 'think', 'record', 'upload', 'complete'
  const [timeLeft, setTimeLeft] = useState(30);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const streamRef = useRef(null);
  
  const [responses, setResponses] = useState([]);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/interviews/${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.questions && data.questions.length > 0) {
          setInterviewData(data);
          startCamera();
        } else {
          console.error("No questions found");
        }
      })
      .catch(err => console.error(err));
      
    return () => stopCamera();
  }, [token]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera: ", err);
      alert("Could not access camera and microphone. Please grant permissions.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

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

  const startRecording = () => {
    recordedChunksRef.current = [];
    if (!streamRef.current) {
      alert("Camera not ready.");
      return;
    }
    const mediaRecorder = new MediaRecorder(streamRef.current);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };
    mediaRecorder.onstop = () => {
      uploadVideo();
    };
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setPhase('record');
    setTimeLeft(180); // 3 minutes
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && phase === 'record') {
      mediaRecorderRef.current.stop();
    }
  };

  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const uploadVideo = async () => {
    setPhase('upload');
    const blob = new Blob(recordedChunksRef.current, { type: 'video/mp4' });
    const totalSize = blob.size;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE) || 1;
    
    try {
      for (let i = 0; i < totalChunks; i++) {
        let success = false;
        let retries = 0;
        const position = i * CHUNK_SIZE;
        const length = Math.min(CHUNK_SIZE, totalSize - position);
        const chunkBlob = blob.slice(position, position + length);
        
        const chunkBase64 = await blobToBase64(chunkBlob);
        
        while (!success && retries < 3) {
          try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/interviews/${token}/upload-chunk`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                question_index: currentQuestionIndex,
                chunk_index: i,
                total_chunks: totalChunks,
                data: chunkBase64
              })
            });
            if (!res.ok) throw new Error("Upload failed");
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
      alert("Could not upload the video. Please check your connection.");
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
    } catch (e) {
      console.error(e);
    }
  };

  if (!interviewData) return <div className="p-20 text-center text-on-surface">Validating Interview Link...</div>;

  if (phase === 'complete') {
    return (
      <div className="flex flex-col min-h-screen bg-[#f9f9fb] text-[#1a1c1d] items-center justify-center p-8 text-center">
        <span className="text-[64px] mb-4">🎉</span>
        <h1 className="font-display-lg text-4xl mb-4">Interview Complete</h1>
        <p className="text-on-surface-variant max-w-md">Thank you for your time. Your answers have been recorded successfully. The recruiting team will be in touch.</p>
      </div>
    );
  }

  const currentQuestion = interviewData.questions[currentQuestionIndex];
  const totalQuestions = interviewData.questions.length;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="flex flex-col min-h-screen bg-surface text-on-surface font-body-md">
      {/* Top Navigation */}
      <header className="w-full px-8 pt-8 pb-4 flex justify-between items-center bg-surface border-b border-outline-variant/30">
        <span className="font-label-caps text-label-caps text-primary uppercase tracking-widest">
          Question {currentQuestionIndex + 1} of {totalQuestions}
        </span>
        <div className="font-headline-md text-headline-md">
          HireFlow <span className="font-light">Interview</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col md:flex-row p-8 gap-8">
        {/* Left Side: Question */}
        <div className="w-full md:w-1/2 flex flex-col justify-center px-4 md:px-12">
          <h1 className="font-display-lg text-3xl md:text-[40px] font-bold leading-tight mb-8">
            {currentQuestion}
          </h1>
          
          {phase === 'think' && (
            <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/50 max-w-sm">
              <p className="font-label-caps text-label-caps text-on-surface-variant mb-2">THINK TIME</p>
              <div className="flex items-end gap-3 mb-6">
                <span className="font-display-lg text-[48px] leading-none text-primary">{timeLeft}</span>
                <span className="font-body-lg text-on-surface-variant pb-1">seconds left</span>
              </div>
              <button 
                onClick={startRecording}
                className="w-full py-3 bg-primary text-on-primary rounded-full font-label-md shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all"
              >
                Start Answering Now
              </button>
            </div>
          )}

          {phase === 'record' && (
            <div className="bg-error-container/10 p-6 rounded-xl border border-error/20 max-w-sm">
              <p className="font-label-caps text-label-caps text-error mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span>
                RECORDING
              </p>
              <div className="flex items-end gap-3 mb-6">
                <span className="font-display-lg text-[48px] leading-none text-error">{timeString}</span>
                <span className="font-body-lg text-on-surface-variant pb-1">remaining</span>
              </div>
              <button 
                onClick={stopRecording}
                className="w-full py-3 bg-error text-white rounded-full font-label-md shadow-lg shadow-error/20 hover:opacity-90 active:scale-95 transition-all"
              >
                Finish Answer
              </button>
            </div>
          )}
          
          {phase === 'upload' && (
            <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/50 max-w-sm flex flex-col items-center justify-center py-10">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="font-label-md font-medium">Uploading answer... {uploadProgress}%</p>
              <p className="text-on-surface-variant text-sm mt-2 text-center">Please do not close this tab.</p>
            </div>
          )}
        </div>

        {/* Right Side: Camera View */}
        <div className="w-full md:w-1/2 flex items-center justify-center">
          <div className="w-full max-w-[600px] aspect-video bg-surface-container-highest rounded-2xl overflow-hidden relative atmospheric-shadow">
            <video 
              ref={videoRef}
              autoPlay 
              playsInline 
              muted 
              className={`w-full h-full object-cover ${phase === 'upload' ? 'opacity-50 grayscale' : ''}`}
            ></video>
            
            {phase === 'record' && (
              <div className="absolute top-6 right-6 px-4 py-2 bg-black/60 backdrop-blur rounded-full flex items-center gap-2 text-white font-label-md">
                <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span>
                {timeString}
              </div>
            )}
            
            {phase === 'upload' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <span className="text-white font-headline-md">Saving...</span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
