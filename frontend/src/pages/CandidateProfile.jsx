import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

const getLinkedInPhoto = (profileUrl, fallbackId) => {
  if (profileUrl) {
    try {
      const url = new URL(profileUrl);
      const parts = url.pathname.split('/').filter(Boolean);
      const inIdx = parts.indexOf('in');
      if (inIdx !== -1 && parts[inIdx + 1]) {
        return `https://unavatar.io/linkedin/${parts[inIdx + 1]}`;
      }
    } catch (_) { /* ignore */ }
  }
  return `https://i.pravatar.cc/300?u=${fallbackId}`;
};

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
      .then(data => setCandidate(data.id ? data : null))
      .catch(err => console.error(err));
  }, [id]);

  const handleInvite = async () => {
    setIsInviting(true); setInviteError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/candidates/${id}/invite`, {
        method: 'POST', headers: { 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' }
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); setInviteError(err.detail || `Error ${res.status}`); }
      else setInviteSent(true);
    } catch (err) { setInviteError('Network error. Please try again.'); console.error(err); }
    finally { setIsInviting(false); }
  };

  if (!candidate) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const photoUrl = getLinkedInPhoto(candidate.profile_url, candidate.id);
  const matchScore = candidate.semantic_score || 0;
  const circumference = 2 * Math.PI * 45; // r=45
  const dashOffset = circumference - (matchScore / 100) * circumference;

  const competencies = [
    { label: 'Technical Skills', value: candidate.score_breakdown?.technical_skills, color: 'bg-primary' },
    { label: 'Seniority & Leadership', value: candidate.score_breakdown?.seniority, color: 'bg-primary' },
    { label: 'Domain Expertise', value: candidate.score_breakdown?.domain_experience, color: 'bg-secondary-container' },
  ];

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-12 md:py-16 max-w-container-max mx-auto">

      {/* ── Page Header ── */}
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1 font-label-bold text-label-bold text-on-surface-variant uppercase tracking-widest mb-3 hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Pipeline
          </button>
          <h1 className="font-headline-lg text-headline-lg text-primary">{candidate.name}</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            {candidate.current_title || 'Candidate'}
            {candidate.current_company ? ` · ${candidate.current_company}` : ''}
            {' · '}Technical Interview Results
          </p>
        </div>

        {/* Header CTAs */}
        <div className="flex gap-3 shrink-0">
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-3 rounded-full border border-outline-variant text-on-surface font-label-bold text-label-bold hover:bg-surface-variant transition-colors"
          >
            Reject
          </button>
          {candidate.status === 'shortlisted' && (
            <button
              onClick={handleInvite}
              disabled={isInviting || inviteSent}
              className="px-6 py-3 rounded-xl bg-secondary-container text-primary font-label-bold text-label-bold hover:opacity-90 active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(252,138,64,0.2)] disabled:opacity-50"
            >
              {inviteSent ? '✓ Invited!' : isInviting ? 'Sending…' : 'Advance to Interview'}
            </button>
          )}
          {candidate.status === 'invited' && (
            <span className="px-6 py-3 rounded-xl bg-surface-container-low text-primary font-label-bold text-label-bold border border-outline-variant/30">
              ✓ Interview Invitation Sent
            </span>
          )}
        </div>
      </header>

      {inviteError && (
        <div className="mb-6 px-5 py-3 rounded-xl bg-error-container/30 text-error font-label-sm text-label-sm animate-fade-in">
          {inviteError}
        </div>
      )}

      {/* ── Bento Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">

        {/* ── LinkedIn Profile Card ── */}
        <div className="col-span-1 md:col-span-4 bg-surface-container-lowest rounded-3xl p-8 ambient-shadow flex flex-col items-center text-center gap-5 border border-outline-variant/20">
          {/* Photo */}
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-outline-variant/30 bg-surface-container">
              <img
                src={photoUrl}
                alt={candidate.name || 'Candidate'}
                className="w-full h-full object-cover"
                onError={e => { e.target.src = `https://i.pravatar.cc/300?u=${candidate.id}`; }}
              />
            </div>
            {/* LinkedIn badge */}
            {candidate.profile_url && (
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#0077B5] flex items-center justify-center shadow-md">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="white">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </div>
            )}
          </div>

          {/* Identity */}
          <div>
            <h2 className="font-headline-md text-headline-md text-primary font-bold">{candidate.name}</h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              {candidate.current_title || 'Candidate'}
              {candidate.current_company ? ` at ${candidate.current_company}` : ''}
            </p>
            {candidate.email && (
              <p className="font-label-sm text-label-sm text-on-surface-variant mt-1 flex items-center justify-center gap-1">
                <span className="material-symbols-outlined text-[14px]">mail</span>
                {candidate.email}
              </p>
            )}
            {candidate.location && (
              <p className="font-label-sm text-label-sm text-on-surface-variant mt-1 flex items-center justify-center gap-1">
                <span className="material-symbols-outlined text-[14px]">location_on</span>
                {candidate.location}
              </p>
            )}
          </div>

          {/* Status Chip */}
          <span className="px-4 py-1.5 rounded-full bg-surface-container-low font-label-sm text-label-sm text-primary capitalize border border-outline-variant/30">
            {candidate.status || 'Scraped'}
          </span>

          {/* LinkedIn CTA */}
          {candidate.profile_url ? (
            <a
              href={candidate.profile_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 rounded-xl bg-[#0077B5] text-white font-label-bold text-label-bold hover:bg-[#005f8f] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              aria-label="View LinkedIn Profile"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              View LinkedIn Profile
            </a>
          ) : (
            <div className="w-full py-3 rounded-xl bg-surface-container font-label-sm text-label-sm text-on-surface-variant text-center border border-outline-variant/20">
              No LinkedIn profile on file
            </div>
          )}

          {/* HireFlow ID */}
          <p className="font-label-sm text-label-sm text-outline">ID: HF-{candidate.id}</p>
        </div>

        {/* ── Right Column ── */}
        <div className="col-span-1 md:col-span-8 flex flex-col gap-gutter">

          {/* ── Semantic Match Ring ── */}
          <div className="bg-surface-container-lowest rounded-3xl p-8 ambient-shadow border border-outline-variant/20">
            <div className="flex items-center justify-between gap-6">
              {/* Ring */}
              <div className="relative w-36 h-36 shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle className="text-surface-variant" cx="50" cy="50" fill="none" r="45" stroke="currentColor" strokeWidth="8" />
                  <circle
                    className="text-secondary-container transition-all duration-1000 ease-out"
                    cx="50" cy="50" fill="none" r="45"
                    stroke="currentColor"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    strokeWidth="8"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display-lg text-display-lg text-primary leading-none">{matchScore ? Math.round(matchScore) : '--'}</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">/ 100</span>
                </div>
              </div>

              {/* Verdict */}
              <div className="flex-1">
                <h3 className="font-label-bold text-label-bold text-on-surface-variant uppercase tracking-wider mb-2">AI Verdict</h3>
                <p className="font-headline-md text-[20px] font-bold text-primary mb-3">
                  {matchScore >= 60 ? 'High Confidence Hire' : matchScore >= 40 ? 'Potential Match' : 'Review Required'}
                </p>
                {matchScore >= 70 && (
                  <div className="inline-flex items-center gap-2 bg-surface-container-low px-4 py-2 rounded-full">
                    <span className="material-symbols-outlined text-secondary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>trending_up</span>
                    <span className="font-label-sm text-label-sm text-secondary">Top 5% of Candidates</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Competency Breakdown ── */}
          <div className="bg-surface-container-lowest rounded-3xl p-8 ambient-shadow border border-outline-variant/20">
            <h3 className="font-label-bold text-label-bold text-on-surface-variant uppercase tracking-wider mb-6">Competency Breakdown</h3>
            <div className="space-y-5">
              {competencies.map((c, i) => (
                <div key={i}>
                  <div className="flex justify-between mb-2">
                    <span className="font-label-bold text-label-bold text-primary">{c.label}</span>
                    <span className="font-label-bold text-label-bold text-primary">{c.value ? `${c.value}%` : '--'}</span>
                  </div>
                  <div className="w-full bg-surface-variant h-2 rounded-full overflow-hidden">
                    <div className={`${c.color} h-full rounded-full transition-all duration-1000`} style={{ width: `${c.value || 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Strengths & Risks ── */}
        <div className="col-span-1 md:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-gutter">
          {/* Strengths */}
          <div className="bg-surface-container-lowest rounded-3xl p-8 ambient-shadow border-l-4 border-secondary-container border border-outline-variant/20">
            <h3 className="font-label-bold text-label-bold text-primary mb-5 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary-container text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              Key Strengths
            </h3>
            {(candidate.skills || []).length > 0 ? (
              <ul className="space-y-3 font-body-md text-body-md text-on-surface-variant">
                {(candidate.skills || []).slice(0, 4).map((skill, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                    <span>{skill}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-body-md text-body-md text-on-surface-variant italic">Strong general alignment detected. Review the interview scorecard for specifics.</p>
            )}
          </div>

          {/* Risk / Flags */}
          <div className="bg-surface-container-lowest rounded-3xl p-8 ambient-shadow border-l-4 border-error-container border border-outline-variant/20">
            <h3 className="font-label-bold text-label-bold text-primary mb-5 flex items-center gap-2">
              <span className="material-symbols-outlined text-error text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
              Areas to Probe
            </h3>
            {candidate.red_flags && candidate.red_flags.length > 0 ? (
              <ul className="space-y-3 font-body-md text-body-md text-on-surface-variant">
                {candidate.red_flags.map((flag, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-error mt-2 shrink-0 opacity-60" />
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-body-md text-body-md text-on-surface-variant italic">No critical flags detected. Consider probing niche skills during the interview.</p>
            )}
          </div>
        </div>

        {/* ── Interview Scorecard (if available) ── */}
        {candidate.interview?.scorecard && (
          <div className="col-span-1 md:col-span-12 bg-surface-container-lowest rounded-3xl p-8 ambient-shadow border border-outline-variant/20">
            <div className="flex justify-between items-center mb-8">
              <h3 className="font-label-bold text-label-bold text-on-surface-variant uppercase tracking-wider">Interview Scorecard</h3>
              <div className="flex items-center gap-2">
                <span className="font-body-md text-body-md text-on-surface-variant">Overall</span>
                <span className="font-headline-md text-headline-md text-primary font-bold">
                  {Math.round(candidate.interview.scorecard.overall_average * 10)}%
                </span>
              </div>
            </div>
            <div className="space-y-8">
              {candidate.interview.scorecard.questions.map((q, idx) => (
                <div key={idx} className="border-b border-outline-variant/30 pb-8 last:border-0 last:pb-0">
                  <p className="font-headline-md text-[16px] font-semibold text-primary mb-4">
                    Q{idx + 1}: <span className="font-normal text-on-surface-variant">Answer Analysis</span>
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                    {['clarity', 'relevance', 'specificity', 'depth'].map(dim => (
                      <div key={dim} className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30">
                        <p className="font-label-sm text-label-sm text-on-surface-variant mb-1 uppercase tracking-wider capitalize">{dim}</p>
                        <p className="font-bold text-primary text-[22px]">{q.dimensions?.[dim] || 0}<span className="text-on-surface-variant text-sm">/10</span></p>
                      </div>
                    ))}
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant mb-4">{q.summary}</p>
                  {q.follow_up_questions?.length > 0 && (
                    <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/30">
                      <p className="font-label-bold text-label-bold text-primary mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">psychology_alt</span>
                        Recommended Follow-ups
                      </p>
                      <ul className="space-y-2 font-body-md text-body-md text-on-surface-variant list-disc pl-5">
                        {q.follow_up_questions.map((fq, i) => <li key={i}>{fq}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Experience Summary ── */}
        {candidate.experience_summary && (
          <div className="col-span-1 md:col-span-12 bg-surface-container-lowest rounded-3xl p-8 ambient-shadow border border-outline-variant/20">
            <h3 className="font-label-bold text-label-bold text-on-surface-variant uppercase tracking-wider mb-5">Experience Summary</h3>
            <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">{candidate.experience_summary}</p>
          </div>
        )}
      </div>

      {/* ── Footer Actions ── */}
      <footer className="mt-12 pt-8 border-t border-outline-variant/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="text-on-surface-variant font-label-bold text-label-bold flex items-center gap-2 hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined">arrow_back</span>
          Back to Pipeline
        </button>
        <div className="flex flex-wrap gap-3">
          <button className="px-6 py-3 rounded-full border border-outline-variant font-label-bold text-label-bold text-on-surface hover:bg-surface-container transition-colors">
            Archive Profile
          </button>
          {candidate.status === 'shortlisted' && (
            <button
              onClick={handleInvite}
              disabled={isInviting || inviteSent}
              className="px-8 py-3 rounded-xl bg-primary text-on-primary font-label-bold text-label-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 shadow-[0_4px_20px_rgba(0,0,0,0.1)]"
            >
              {inviteSent ? '✓ Invite Sent!' : isInviting ? 'Sending…' : 'Initiate Interview Flow'}
            </button>
          )}
          {(candidate.status === 'scored' || candidate.status === 'scraped') && (
            <span className="px-6 py-3 rounded-full border border-outline-variant text-on-surface-variant font-label-sm text-label-sm">
              Shortlist candidate first to invite
            </span>
          )}
          {candidate.status === 'invited' && (
            <span className="px-6 py-3 rounded-xl bg-surface-container-low text-primary font-label-bold text-label-bold border border-outline-variant/30">
              ✓ Interview Invitation Sent
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
