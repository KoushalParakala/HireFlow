import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

export default function InterviewRecording() {
  const { token } = useParams();
  const [interviewData, setInterviewData] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(165); // 2:45

  useEffect(() => {
    // Fetch interview data via token
    fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/interviews/${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.questions && data.questions.length > 0) {
          setInterviewData(data);
        } else {
          console.error("No questions found");
        }
      })
      .catch(err => console.error(err));
  }, [token]);

  useEffect(() => {
    if (timeLeft > 0 && isRecording) {
      const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && isRecording) {
      setIsRecording(false);
    }
  }, [timeLeft, isRecording]);

  const handleRecordToggle = () => {
    setIsRecording(!isRecording);
  };

  const handleNext = () => {
    if (interviewData && currentQuestionIndex < interviewData.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setTimeLeft(165); // Reset timer
      setIsRecording(false);
    }
  };

  if (!interviewData) return <div className="p-20 text-center text-on-surface">Validating Interview Link...</div>;

  const currentQuestion = interviewData.questions[currentQuestionIndex];
  const totalQuestions = interviewData.questions.length;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} remaining`;

  return (
    <div className="flex flex-col min-h-screen bg-[#f9f9fb] text-[#1a1c1d] font-body-md">
      {/* Top Navigation / Status Area */}
      <header className="w-full px-margin-mobile pt-12 pb-6 flex flex-col items-center justify-center space-y-2">
        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">
          Question {currentQuestionIndex + 1} of {totalQuestions}
        </span>
        <div className="flex items-center space-x-2">
          <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            timer
          </span>
          <span className="font-headline-md text-headline-md-mobile text-on-surface tabular-nums">
            {timeString}
          </span>
        </div>
      </header>

      {/* Main Question Canvas */}
      <main className="flex-grow flex items-center justify-center px-margin-mobile">
        <div className="w-full max-w-md text-center px-8">
          <h1 className="font-display-lg-mobile text-[40px] font-bold text-on-surface leading-[1.1] tracking-tight">
            {currentQuestion}
          </h1>
        </div>
      </main>

      {/* Recording Controls & Bottom Navigation */}
      <section className="flex flex-col items-center pb-32 pt-12">
        {/* Floating Pulse Record Button */}
        <div className="relative group cursor-pointer" onClick={handleRecordToggle}>
          <div className={`absolute inset-0 rounded-full ${isRecording ? 'bg-error opacity-20 pulse-effect' : 'bg-primary opacity-20'}`}></div>
          <button 
            className={`relative flex items-center justify-center w-24 h-24 text-on-primary rounded-full shadow-lg active:scale-95 transition-transform duration-150 ${isRecording ? 'bg-error' : 'bg-primary'}`}
          >
            <span className="material-symbols-outlined text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              {isRecording ? 'stop' : 'mic'}
            </span>
          </button>
          <span className={`absolute -bottom-8 left-1/2 -translate-x-1/2 font-label-caps text-label-caps ${isRecording ? 'text-error' : 'text-primary'}`}>
            {isRecording ? 'Stop' : 'Record'}
          </span>
        </div>
        
        {/* Next Question / Finish Button */}
        {!isRecording && timeLeft < 165 && (
          <button 
            onClick={handleNext}
            className="mt-16 px-8 py-3 bg-surface-container-high hover:bg-surface-container-highest transition-colors rounded-full font-label-md text-on-surface"
          >
            {currentQuestionIndex < totalQuestions - 1 ? 'Next Question' : 'Finish Interview'}
          </button>
        )}
      </section>

      {/* Shared Bottom Navigation Shell */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center h-16 atmospheric-blur border-t border-outline-variant/30 sm:hidden">
        {/* Record Tab (Active) */}
        <a className="flex flex-col items-center justify-center text-secondary font-bold scale-95 transition-transform">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
          <span className="font-label-sm text-[10px] uppercase tracking-wider mt-1">Record</span>
        </a>
        
        {/* Progress Tab (Inactive) */}
        <a className="flex flex-col items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors px-4 py-2 rounded-xl">
          <span className="material-symbols-outlined">segment</span>
          <span className="font-label-sm text-[10px] uppercase tracking-wider mt-1">Progress</span>
        </a>
      </nav>

      {/* Inject pulse animation styles directly here to guarantee they work independently */}
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.05); opacity: 0.4; }
          100% { transform: scale(0.95); opacity: 0.8; }
        }
        .pulse-effect {
          animation: pulse-ring 2s infinite ease-in-out;
        }
        .atmospheric-blur {
          backdrop-filter: blur(20px);
          background: rgba(249, 249, 251, 0.7);
        }
      `}</style>
    </div>
  );
}
