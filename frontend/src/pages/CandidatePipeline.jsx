import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

// Derive LinkedIn photo URL from profile URL (best-effort)
const getLinkedInPhoto = (profileUrl, fallbackId) => {
  if (profileUrl) {
    try {
      const url = new URL(profileUrl);
      const parts = url.pathname.split('/').filter(Boolean);
      // e.g. /in/john-doe → slug is "john-doe"
      const inIdx = parts.indexOf('in');
      if (inIdx !== -1 && parts[inIdx + 1]) {
        return `https://unavatar.io/linkedin/${parts[inIdx + 1]}`;
      }
    } catch (_) { /* ignore */ }
  }
  return `https://i.pravatar.cc/150?u=${fallbackId}`;
};

const STATUS_STYLES = {
  shortlisted: 'bg-surface-container-low text-primary',
  invited:     'bg-secondary-container/20 text-secondary',
  processing:  'bg-tertiary-fixed text-on-tertiary-fixed',
  interviewed: 'bg-tertiary-fixed text-on-tertiary-fixed',
  scored:      'bg-surface-container-high text-on-surface-variant',
  scraped:     'bg-surface-container-high text-on-surface-variant',
  manual:      'bg-surface-container-low text-primary',
};

const DOT_STYLES = {
  shortlisted: 'bg-primary',
  invited:     'bg-secondary',
  processing:  'bg-on-tertiary-fixed',
  interviewed: 'bg-on-tertiary-fixed',
  scored:      'bg-surface-dim',
  scraped:     'bg-surface-dim',
  manual:      'bg-primary',
};

const STATUS_LABELS = {
  shortlisted: 'Shortlisted',
  invited:     'Invited',
  processing:  'Processing',
  interviewed: 'Interviewed',
  scored:      'Scored',
  scraped:     'Scraped',
  manual:      'Manual Add',
};

export default function CandidatePipeline() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [isScraping, setIsScraping] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', email: '', current_title: '', current_company: '' });
  const [isAdding, setIsAdding] = useState(false);
  const navigate = useNavigate();

  const fetchCandidates = () => {
    setIsLoading(true);
    fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/candidates/?job_id=${jobId}`, {
      headers: { 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' }
    })
      .then(res => res.json())
      .then(data => { setCandidates(Array.isArray(data) ? data : []); setIsLoading(false); })
      .catch(err => { console.error(err); setIsLoading(false); });
  };

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/jobs/`, {
      headers: { 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' }
    })
      .then(res => res.json())
      .then(data => { const found = Array.isArray(data) ? data.find(j => j.id == jobId) : null; setJob(found); });
    fetchCandidates();
  }, [jobId]);

  const handleScrape = async () => {
    setIsScraping(true); setActionError(''); setActionSuccess('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/jobs/${jobId}/scrape`, {
        method: 'POST', headers: { 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' }
      });
      const data = await res.json();
      if (!res.ok) { setActionError(data.detail || `Scraping failed (${res.status})`); }
      else { setActionSuccess(`Scraping complete — ${data.candidates?.length ?? 0} candidates found.`); fetchCandidates(); }
    } catch (err) { setActionError('Network error during scraping. Is the backend running?'); console.error(err); }
    finally { setIsScraping(false); }
  };

  const handleScore = async () => {
    setIsScoring(true); setActionError(''); setActionSuccess('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/jobs/${jobId}/score`, {
        method: 'POST', headers: { 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' }
      });
      const data = await res.json();
      if (!res.ok) { setActionError(data.detail || `Scoring failed (${res.status})`); }
      else { setActionSuccess(`Scoring complete — ${data.shortlisted ?? 0} shortlisted at threshold ${data.threshold_used ?? '--'}.`); fetchCandidates(); }
    } catch (err) { setActionError('Network error during scoring. Is the backend running?'); console.error(err); }
    finally { setIsScoring(false); }
  };

  const toggleCandidateSelection = (e, id) => {
    e.preventDefault();
    setSelectedCandidates(prev => prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]);
  };

  const handleCompare = () => {
    if (selectedCandidates.length >= 2) navigate(`/jobs/${jobId}/compare?candidates=${selectedCandidates.join(',')}`);
  };

  const handleInvite = async (e, id) => {
    e.preventDefault(); e.stopPropagation();
    setActionError(''); setActionSuccess('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/candidates/${id}/invite`, {
        method: 'POST', headers: { 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' }
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); setActionError(err.detail || `Error ${res.status}: Could not send invite.`); }
      else { setActionSuccess(`Invite sent to candidate HF-${id}`); fetchCandidates(); }
    } catch (err) { setActionError('Network error. Please try again.'); console.error(err); }
  };

  const handleManualAdd = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.email.trim()) { setActionError('Name and email are required.'); return; }
    setIsAdding(true); setActionError(''); setActionSuccess('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/candidates/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' },
        body: JSON.stringify({ job_id: Number(jobId), ...addForm })
      });
      const data = await res.json();
      if (!res.ok) { setActionError(data.detail || `Could not add candidate (${res.status})`); }
      else { setActionSuccess(`${addForm.name} added and shortlisted.`); setShowAddModal(false); setAddForm({ name: '', email: '', current_title: '', current_company: '' }); fetchCandidates(); }
    } catch (err) { setActionError('Network error while adding candidate.'); console.error(err); }
    finally { setIsAdding(false); }
  };

  const sortedCandidates = [...candidates].sort((a, b) => (b.semantic_score || 0) - (a.semantic_score || 0));

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-12 md:py-16 max-w-container-max mx-auto">

      {/* ── Page Header ── */}
      <header className="mb-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <Link to="/" className="inline-flex items-center gap-1 font-label-bold text-label-bold text-on-surface-variant uppercase tracking-widest mb-3 hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Pipeline
            </Link>
            <h1 className="font-display-lg-mobile text-display-lg-mobile md:font-display-lg md:text-display-lg text-primary mb-2">
              {job?.title || 'Loading...'}
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              {candidates.length} candidates · AI semantic matching enabled
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-outline-variant text-on-surface font-label-bold text-label-bold hover:bg-surface-container-low active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              Add Candidate
            </button>
            <button
              onClick={handleScrape}
              disabled={isScraping}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-surface-container-low text-on-surface-variant font-label-bold text-label-bold hover:bg-surface-container-high active:scale-95 transition-all disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[18px] ${isScraping ? 'animate-spin' : ''}`}>
                {isScraping ? 'sync' : 'travel_explore'}
              </span>
              {isScraping ? 'Searching LinkedIn…' : 'Scrape Candidates'}
            </button>
            <button
              onClick={handleScore}
              disabled={isScoring || candidates.length === 0}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-on-primary font-label-bold text-label-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 shadow-[0_4px_20px_rgba(0,0,0,0.1)]"
            >
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              {isScoring ? 'Scoring…' : 'Score Candidates'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Action Feedback ── */}
      {actionError && (
        <div className="mb-6 px-5 py-4 rounded-xl bg-error-container/30 border border-error/20 text-error font-label-sm text-label-sm flex items-center gap-3 animate-fade-in">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="mb-6 px-5 py-4 rounded-xl bg-surface-container-low border border-primary/10 text-primary font-label-sm text-label-sm flex items-center gap-3 animate-fade-in">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          {actionSuccess}
        </div>
      )}

      {/* ── Candidate Grid ── */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-gutter">

        {/* Loading Skeletons */}
        {isLoading && candidates.length === 0 && [1, 2, 3, 4].map(n => (
          <div key={n} className="bg-surface-container-lowest rounded-3xl p-8 ambient-shadow animate-pulse">
            <div className="flex items-start justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-surface-container" />
                <div className="space-y-2">
                  <div className="w-36 h-4 bg-surface-container rounded" />
                  <div className="w-24 h-3 bg-surface-container rounded" />
                </div>
              </div>
              <div className="w-16 h-12 bg-surface-container rounded" />
            </div>
            <div className="flex gap-2 mb-8">
              <div className="w-20 h-6 bg-surface-container rounded-full" />
              <div className="w-24 h-6 bg-surface-container rounded-full" />
            </div>
            <div className="h-12 bg-surface-container rounded-xl" />
          </div>
        ))}

        {/* Empty State */}
        {!isLoading && candidates.length === 0 && (
          <div className="xl:col-span-2 py-24 text-center border border-dashed border-outline-variant rounded-3xl bg-surface-container-lowest flex flex-col items-center">
            <span className="material-symbols-outlined text-[64px] text-surface-dim mb-4" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>group</span>
            <p className="font-headline-md text-[18px] font-semibold text-primary mb-2">No candidates found yet</p>
            <p className="font-body-md text-body-md text-on-surface-variant">Click "Scrape Candidates" to source from LinkedIn automatically.</p>
          </div>
        )}

        {/* Candidate Cards */}
        {sortedCandidates.map((candidate, idx) => {
          const isTop = idx === 0 && candidate.semantic_score >= 80;
          const photoUrl = getLinkedInPhoto(candidate.profile_url, candidate.id);

          return (
            <article
              key={candidate.id}
              className="bg-surface-container-lowest rounded-3xl p-8 ambient-shadow relative overflow-hidden group hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] transition-all duration-300 border border-transparent hover:border-outline-variant/30"
            >
              {/* Decorative corner accent */}
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-bl-[100px] -z-10 transition-transform group-hover:scale-110 ${isTop ? 'bg-secondary-container opacity-15' : 'bg-primary-fixed opacity-10'}`} />

              {/* Card Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-surface-container ring-2 ring-outline-variant/30">
                      <img
                        src={photoUrl}
                        alt={candidate.name || 'Candidate'}
                        className="w-full h-full object-cover"
                        onError={e => { e.target.src = `https://i.pravatar.cc/150?u=${candidate.id}`; }}
                      />
                    </div>
                    {/* LinkedIn badge */}
                    {candidate.profile_url && (
                      <a
                        href={candidate.profile_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        title="View LinkedIn Profile"
                        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#0077B5] flex items-center justify-center shadow-md hover:bg-[#005f8f] transition-colors"
                        aria-label="View LinkedIn Profile"
                      >
                        {/* LinkedIn "in" icon */}
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="white">
                          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                        </svg>
                      </a>
                    )}
                  </div>

                  <div>
                    <h3 className="font-headline-md text-[18px] font-bold text-primary">{candidate.name || 'Unknown'}</h3>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      {candidate.current_title || 'Candidate'}
                      {candidate.current_company ? ` · ${candidate.current_company}` : ''}
                    </p>
                    {/* Rank badge */}
                    <span className="font-label-sm text-label-sm text-outline">#{idx + 1} ranked</span>
                  </div>
                </div>

                {/* Semantic Match Score */}
                <div className="text-right shrink-0">
                  <div className="font-display-lg text-display-lg text-primary leading-none">
                    {candidate.semantic_score ? Math.round(candidate.semantic_score) : '--'}
                    <span className="font-headline-md text-headline-md text-on-surface-variant">%</span>
                  </div>
                  <p className={`font-label-sm text-label-sm tracking-widest uppercase mt-1 ${candidate.semantic_score >= 80 ? 'text-secondary' : 'text-on-surface-variant'}`}>
                    Match
                  </p>
                </div>
              </div>

              {/* Skills Pills */}
              <div className="flex flex-wrap gap-2 mb-6">
                {(candidate.skills || []).slice(0, 4).map((skill, i) => (
                  <span key={i} className="skill-pill">{skill}</span>
                ))}
                {isTop && (
                  <span className="px-4 py-1.5 bg-secondary-container/20 text-secondary rounded-full font-label-sm text-label-sm flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                    Top Match
                  </span>
                )}
                {candidate.skills?.length === 0 && (
                  <span className="font-label-sm text-label-sm text-outline italic">No skills extracted yet</span>
                )}
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2 mb-6">
                <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-label-sm text-label-sm ${STATUS_STYLES[candidate.status] || STATUS_STYLES.scraped}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${DOT_STYLES[candidate.status] || DOT_STYLES.scraped}`} />
                  {STATUS_LABELS[candidate.status] || 'Scraped'}
                </span>
                {/* Compare checkbox */}
                <label className="ml-auto flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm cursor-pointer hover:text-primary transition-colors">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer"
                    checked={selectedCandidates.includes(candidate.id)}
                    onChange={(e) => { e.stopPropagation(); toggleCandidateSelection(e, candidate.id); }}
                  />
                  Compare
                </label>
              </div>

              {/* Action Row */}
              <div className="flex gap-3">
                {/* View Profile (goes to candidate detail page) */}
                <Link
                  to={`/candidates/${candidate.id}`}
                  className={`flex-1 py-3 rounded-xl font-label-bold text-label-bold transition-all text-center ${
                    candidate.status === 'shortlisted'
                      ? 'bg-secondary-container text-on-secondary-container hover:opacity-90'
                      : 'border-2 border-primary text-primary hover:bg-primary hover:text-on-primary'
                  }`}
                >
                  {candidate.status === 'shortlisted' ? 'Invite to Interview' : 'View Profile'}
                </Link>

                {/* LinkedIn Profile redirect */}
                {candidate.profile_url ? (
                  <a
                    href={candidate.profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    title="Open LinkedIn Profile"
                    className="px-4 py-3 rounded-xl bg-[#0077B5] text-white hover:bg-[#005f8f] transition-colors flex items-center justify-center"
                    aria-label="Open LinkedIn Profile"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                  </a>
                ) : (
                  <button
                    className="px-4 py-3 rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container-low transition-colors"
                    title="No LinkedIn profile available"
                    disabled
                  >
                    <span className="material-symbols-outlined text-[18px]">bookmark_border</span>
                  </button>
                )}
              </div>

              {/* Quick Invite (if shortlisted) */}
              {candidate.status === 'shortlisted' && (
                <button
                  onClick={e => handleInvite(e, candidate.id)}
                  className="mt-3 w-full py-2.5 rounded-xl text-label-sm font-label-sm text-primary bg-primary/5 hover:bg-primary/10 transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">send</span>
                  Send Interview Invite
                </button>
              )}
            </article>
          );
        })}
      </section>

      {/* ── Footer Bar ── */}
      {candidates.length > 0 && (
        <footer className="mt-12 pt-6 border-t border-outline-variant/30 flex justify-between items-center">
          <p className="font-body-md text-body-md text-on-surface-variant">
            Showing <span className="font-semibold text-primary">{candidates.length}</span> candidates
          </p>
          <div className="flex gap-2">
            <button className="p-2 rounded-lg hover:bg-surface-container-low text-on-surface-variant transition-colors disabled:opacity-30" disabled>
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <button className="w-10 h-10 rounded-lg bg-primary text-on-primary font-label-bold text-label-bold">1</button>
            <button className="p-2 rounded-lg hover:bg-surface-container-low text-on-surface-variant transition-colors disabled:opacity-30" disabled>
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </footer>
      )}

      {/* ── Compare Float Bar ── */}
      {selectedCandidates.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-surface-container-lowest shadow-2xl rounded-full px-6 py-4 flex items-center gap-6 border border-outline-variant z-50 animate-fade-in">
          <span className="font-label-bold text-label-bold">
            <span className="text-secondary">{selectedCandidates.length}</span> selected
          </span>
          <button
            onClick={handleCompare}
            disabled={selectedCandidates.length < 2 || selectedCandidates.length > 4}
            className="px-6 py-2 rounded-full bg-primary text-on-primary font-label-bold text-label-bold hover:opacity-90 active:scale-95 disabled:opacity-40 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">compare_arrows</span>
            Compare ({selectedCandidates.length}/4)
          </button>
          <button onClick={() => setSelectedCandidates([])} className="text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      )}

      {/* ── Add Candidate Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-6 animate-fade-in" onClick={() => setShowAddModal(false)}>
          <div className="bg-surface-container-lowest rounded-3xl p-8 w-full max-w-md ambient-shadow" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-headline-md text-headline-md text-primary">Add Candidate</h3>
              <button onClick={() => setShowAddModal(false)} className="p-2 rounded-xl hover:bg-surface-container-low transition-colors">
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant mb-6">
              For referrals or direct applicants — added straight to the shortlist.
            </p>
            <form onSubmit={handleManualAdd} className="space-y-3">
              {[
                { type: 'text', required: true, placeholder: 'Full name *', key: 'name' },
                { type: 'email', required: true, placeholder: 'Email address *', key: 'email' },
                { type: 'text', required: false, placeholder: 'Current title (optional)', key: 'current_title' },
                { type: 'text', required: false, placeholder: 'Current company (optional)', key: 'current_company' },
              ].map(field => (
                <input
                  key={field.key}
                  type={field.type}
                  required={field.required}
                  placeholder={field.placeholder}
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-variant focus:bg-surface-container-lowest focus:border-primary focus:outline-none transition-all font-body-md text-body-md"
                  value={addForm[field.key]}
                  onChange={e => setAddForm({ ...addForm, [field.key]: e.target.value })}
                />
              ))}
              {actionError && <p className="text-error font-label-sm text-label-sm">{actionError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="flex-1 px-6 py-3 rounded-xl border border-outline-variant font-label-bold text-label-bold hover:bg-surface-container-low transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={isAdding}
                  className="flex-1 px-6 py-3 rounded-xl bg-primary text-on-primary font-label-bold text-label-bold hover:opacity-90 disabled:opacity-50 transition-all">
                  {isAdding ? 'Adding…' : 'Add & Shortlist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
