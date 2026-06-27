import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function CandidateProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState(null);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteError, setInviteError] = useState('');

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/candidates/${id}`, {
      headers: { 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' }
    })
      .then(res => res.json())
      .then(data => {
        // The API returns the single candidate object
        setCandidate(data.id ? data : null);
      })
      .catch(err => console.error(err));
  }, [id]);

  const handleInvite = async () => {
    setIsInviting(true);
    setInviteError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/candidates/${id}/invite`, { 
        method: 'POST',
        headers: { 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setInviteError(err.detail || `Error ${res.status}: Could not send invite.`);
      } else {
        setInviteSent(true);
      }
    } catch (err) {
      setInviteError('Network error. Please try again.');
      console.error(err);
    } finally {
      setIsInviting(false);
    }
  };

  if (!candidate) return <div className="p-20 text-center">Loading...</div>;

  const getAvatar = (id) => `https://i.pravatar.cc/300?u=${id}`;

  return (
    <div className="max-w-[1100px] mx-auto px-8 pt-16 pb-32">
      {/* Header / Identity */}
      <header className="mb-16 flex flex-col md:flex-row justify-between items-end gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-label-caps text-[10px] uppercase tracking-widest">
              {candidate.status === 'shortlisted' ? 'Shortlisted' : 'Active Application'}
            </span>
            <span className="text-on-surface-variant font-label-md text-[14px]">ID: HF-{candidate.id}</span>
          </div>
          <h1 className="font-display-lg text-display-lg">{candidate.name}</h1>
          <p className="text-on-surface-variant font-body-lg text-body-lg max-w-xl">
            {candidate.current_title || 'Software Engineer'}{candidate.current_company ? ` at ${candidate.current_company}` : ''}
          </p>
        </div>

        {/* AI Verdict Badge */}
        <div className="bg-surface-container-low p-8 rounded-xl atmospheric-shadow border border-outline-variant/20 min-w-[320px]">
          <div className="flex justify-between items-start mb-6">
            <span className="font-label-caps text-label-caps text-on-surface-variant">AI VERDICT</span>
            <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-[48px] font-bold leading-none text-primary">{candidate.semantic_score || '--'}%</span>
            <span className="text-on-surface-variant font-body-md">match</span>
          </div>
          <p className="text-primary font-semibold text-[18px] mb-4">
            {candidate.semantic_score >= 60 ? 'High Confidence Hire' : (candidate.semantic_score >= 40 ? 'Potential Match' : 'Review Required')}
          </p>
          <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
            <div className="score-gradient h-full transition-all duration-1000 ease-out" style={{ width: `${candidate.semantic_score || 0}%` }}></div>
          </div>
        </div>
      </header>

      {/* Bento Grid Analysis */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-24">
        {/* Semantic Score Breakdown */}
        <div className="md:col-span-7 bg-white p-10 rounded-xl atmospheric-shadow hairline-border">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-10">SEMANTIC FIT ANALYSIS</h3>
          <div className="space-y-12">
            <div>
              <div className="flex justify-between mb-4">
                <span className="font-body-md font-medium">Technical Proficiency</span>
                <span className="font-label-md text-primary font-bold">{candidate.score_breakdown?.technical_skills || '--'}%</span>
              </div>
              <div className="w-full bg-surface-container h-1 rounded-full overflow-hidden">
                <div className="bg-primary h-full" style={{ width: `${candidate.score_breakdown?.technical_skills || 0}%` }}></div>
              </div>
              <p className="mt-4 text-on-surface-variant text-[14px] leading-relaxed">
                Evaluated against the core technical skills requested in the job description.
              </p>
            </div>
            
            <div>
              <div className="flex justify-between mb-4">
                <span className="font-body-md font-medium">Seniority & Leadership</span>
                <span className="font-label-md text-primary font-bold">{candidate.score_breakdown?.seniority || '--'}%</span>
              </div>
              <div className="w-full bg-surface-container h-1 rounded-full overflow-hidden">
                <div className="bg-primary h-full" style={{ width: `${candidate.score_breakdown?.seniority || 0}%` }}></div>
              </div>
              <p className="mt-4 text-on-surface-variant text-[14px] leading-relaxed">
                Based on previous titles, tenure length, and indicators of managing scale or teams.
              </p>
            </div>

            <div>
              <div className="flex justify-between mb-4">
                <span className="font-body-md font-medium">Domain Expertise</span>
                <span className="font-label-md text-primary font-bold">{candidate.score_breakdown?.domain_experience || '--'}%</span>
              </div>
              <div className="w-full bg-surface-container h-1 rounded-full overflow-hidden">
                <div className="bg-primary h-full" style={{ width: `${candidate.score_breakdown?.domain_experience || 0}%` }}></div>
              </div>
              <p className="mt-4 text-on-surface-variant text-[14px] leading-relaxed">
                Alignment with the specific industry context of the role.
              </p>
            </div>
          </div>
        </div>

        {/* Risk Analysis */}
        <div className="md:col-span-5 bg-surface-container-lowest p-10 rounded-xl border border-error/10">
          <h3 className="font-label-caps text-label-caps text-error mb-10 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">warning</span> RISK ASSESSMENT
          </h3>
          <div className="space-y-8">
            <div className="p-6 bg-error-container/20 rounded-lg">
              <div className="flex justify-between items-start mb-3">
                <p className="font-semibold text-on-surface">Experience Gaps</p>
              </div>
              <div className="text-[14px] text-on-surface-variant leading-relaxed">
                {candidate.red_flags && candidate.red_flags.length > 0 ? (
                  <ul className="list-disc pl-4 space-y-2">
                    {candidate.red_flags.map((flag, i) => (
                      <li key={i}>{flag}</li>
                    ))}
                  </ul>
                ) : (
                  <p>AI analysis shows general alignment, but specific niche skills may require deeper probing during the interview.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA / Footer Actions */}
      <footer className="mt-24 pt-12 border-t border-outline-variant/30 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <button 
            onClick={() => navigate(-1)}
            className="text-on-surface-variant font-label-md flex items-center gap-2 hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back</span> Back to Pipeline
          </button>
          <div className="flex gap-4">
            <button className="px-8 py-3 rounded-full border border-outline-variant font-label-md hover:bg-surface-container transition-colors">
              Archive Profile
            </button>
            
            {candidate.status === 'shortlisted' && (
              <button 
                onClick={handleInvite}
                disabled={isInviting || inviteSent}
                className="px-10 py-3 rounded-full bg-primary text-white font-label-md atmospheric-shadow hover:bg-primary-container transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
              >
                {inviteSent ? '✓ Invite Sent!' : (isInviting ? 'Sending...' : 'Initiate Interview Flow')}
              </button>
            )}

            {(candidate.status === 'scored' || candidate.status === 'scraped') && (
              <span className="px-6 py-3 rounded-full border border-outline-variant text-on-surface-variant font-label-md text-sm">
                Shortlist candidate first to invite
              </span>
            )}

            {candidate.status === 'invited' && (
              <span className="px-6 py-3 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-sm">
                ✓ Interview Invitation Sent
              </span>
            )}
          </div>
        </div>
        {inviteError && (
          <p className="text-error text-sm text-right">{inviteError}</p>
        )}
      </footer>
    </div>
  );
}
