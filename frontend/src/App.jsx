import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';

// Lazy load pages
const JobOverview = lazy(() => import('./pages/JobOverview'));
const CandidatePipeline = lazy(() => import('./pages/CandidatePipeline'));
const CandidateProfile = lazy(() => import('./pages/CandidateProfile'));
const CandidateComparison = lazy(() => import('./pages/CandidateComparison'));
const InterviewRecording = lazy(() => import('./pages/InterviewRecording'));
const OpenApp = lazy(() => import('./pages/OpenApp'));

// Simple loading indicator for Suspense fallback
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
  </div>
);

function App() {
  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Candidate Mobile View (No layout) */}
          <Route path="/interview/:token" element={<InterviewRecording />} />
          <Route path="/open-app/:token" element={<OpenApp />} />

          {/* Recruiter Web Dashboard Views */}
          <Route path="/" element={<Layout><JobOverview /></Layout>} />
          <Route path="/jobs/:jobId" element={<Layout><CandidatePipeline /></Layout>} />
          <Route path="/jobs/:jobId/compare" element={<Layout><CandidateComparison /></Layout>} />
          <Route path="/candidates/:id" element={<Layout><CandidateProfile /></Layout>} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
