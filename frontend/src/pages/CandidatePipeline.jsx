import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

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
      .then(data => {
        setCandidates(Array.isArray(data) ? data : []);
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/jobs/`, {
      headers: { 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' }
    })
      .then(res => res.json())
      .then(data => {
        const found = Array.isArray(data) ? data.find(j => j.id == jobId) : null;
        setJob(found);
      });
    fetchCandidates();
  }, [jobId]);

  const handleScrape = async () => {
    setIsScraping(true);
    setActionError('');
    setActionSuccess('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/jobs/${jobId}/scrape`, { 
        method: 'POST',
        headers: { 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' }
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.detail || `Scraping failed (${res.status})`);
      } else {
        const inserted = data.candidates?.length ?? 0;
        setActionSuccess(`Scraping complete — ${inserted} candidates found.`);
        fetchCandidates();
      }
    } catch (err) {
      setActionError('Network error during scraping. Is the backend running?');
      console.error(err);
    } finally {
      setIsScraping(false);
    }
  };

  const handleScore = async () => {
    setIsScoring(true);
    setActionError('');
    setActionSuccess('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/jobs/${jobId}/score`, { 
        method: 'POST',
        headers: { 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' }
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.detail || `Scoring failed (${res.status})`);
      } else {
        setActionSuccess(`Scoring complete — ${data.shortlisted ?? 0} candidates shortlisted at threshold ${data.threshold_used ?? '--'}.`);
        fetchCandidates();
      }
    } catch (err) {
      setActionError('Network error during scoring. Is the backend running?');
      console.error(err);
    } finally {
      setIsScoring(false);
    }
  };

  const toggleCandidateSelection = (e, id) => {
    e.preventDefault();
    setSelectedCandidates(prev => 
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    );
  };

  const handleCompare = () => {
    if (selectedCandidates.length >= 2) {
      navigate(`/jobs/${jobId}/compare?candidates=${selectedCandidates.join(',')}`);
    }
  };

  const handleInvite = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setActionError('');
    setActionSuccess('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/candidates/${id}/invite`, { 
        method: 'POST',
        headers: { 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionError(err.detail || `Error ${res.status}: Could not send invite.`);
      } else {
        setActionSuccess(`Invite sent to candidate HF-${id}`);
        fetchCandidates();
      }
    } catch (err) {
      setActionError('Network error. Please try again.');
      console.error(err);
    }
  };

  const handleManualAdd = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.email.trim()) {
      setActionError('Name and email are required.');
      return;
    }
    setIsAdding(true);
    setActionError('');
    setActionSuccess('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/candidates/manual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM='
        },
        body: JSON.stringify({ job_id: Number(jobId), ...addForm })
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.detail || `Could not add candidate (${res.status})`);
      } else {
        setActionSuccess(`${addForm.name} added and shortlisted.`);
        setShowAddModal(false);
        setAddForm({ name: '', email: '', current_title: '', current_company: '' });
        fetchCandidates();
      }
    } catch (err) {
      setActionError('Network error while adding candidate.');
      console.error(err);
    } finally {
      setIsAdding(false);
    }
  };

  // Render dummy avatars for visual polish
  const getAvatar = (id) => `https://i.pravatar.cc/150?u=${id}`;

  return (
    <div className="max-w-[1200px] mx-auto px-8 md:px-20 py-stack-xl">
      {/* View Header Section */}
      <section className="flex flex-col md:flex-row justify-between items-end gap-stack-md mb-stack-lg">
        <div className="space-y-2">
          <span className="font-label-caps text-label-caps text-primary tracking-widest uppercase">Active Role</span>
          <h1 className="font-display-lg text-display-lg-mobile md:text-display-lg text-on-surface tracking-tight">
            {job?.title || 'Loading...'}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            {candidates.length} Active Candidates
          </p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-full border border-outline-variant text-on-surface font-medium transition-all hover:bg-surface-container-low active:scale-95"
          >
            <span className="material-symbols-outlined text-sm">person_add</span>
            <span className="text-label-md font-label-md">Add Candidate</span>
          </button>
          <button 
            onClick={handleScrape}
            disabled={isScraping}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-surface-container-low text-on-surface-variant font-medium transition-all hover:bg-surface-container-high active:scale-95 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">{isScraping ? 'sync' : 'travel_explore'}</span>
            <span className="text-label-md font-label-md">{isScraping ? 'Searching LinkedIn... (~2 mins)' : 'Scrape Candidates'}</span>
          </button>
          
          <button 
            onClick={handleScore}
            disabled={isScoring || candidates.length === 0}
            className="flex items-center gap-2 px-8 py-3 rounded-full bg-primary text-on-primary font-medium transition-all hover:opacity-90 active:scale-95 shadow-lg shadow-primary/10 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">auto_awesome</span>
            <span className="text-label-md font-label-md">{isScoring ? 'Scoring...' : 'Score Candidates'}</span>
          </button>
        </div>
      </section>

      {/* Action Feedback */}
      {actionError && (
        <div className="mb-6 px-6 py-4 rounded-xl bg-error-container/20 border border-error/20 text-error text-sm flex items-center gap-3">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="mb-6 px-6 py-4 rounded-xl bg-primary-fixed/20 border border-primary/20 text-primary text-sm flex items-center gap-3">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          {actionSuccess}
        </div>
      )}

      {/* Pipeline Grid/List */}
      <section className="space-y-4">
        {/* Table Header (Subtle) */}
        <div className="grid grid-cols-12 px-8 py-4 text-on-surface-variant/60 font-label-caps text-label-caps">
          <div className="col-span-1">RANK</div>
          <div className="col-span-1 text-center">COMPARE</div>
          <div className="col-span-4">CANDIDATE</div>
          <div className="col-span-3">STATUS</div>
          <div className="col-span-2 text-right">AI MATCH</div>
          <div className="col-span-1 text-right"></div>
        </div>

        {/* Candidates */}
        {candidates.sort((a, b) => (b.semantic_score || 0) - (a.semantic_score || 0)).map((candidate, idx) => (
          <Link to={`/candidates/${candidate.id}`} key={candidate.id}>
            <div className="group grid grid-cols-12 items-center bg-surface border border-outline-variant/30 rounded-xl px-8 py-10 transition-all hover:border-primary/20 hover:bg-white atmospheric-shadow cursor-pointer mb-4">
              <div className="col-span-1">
                <span className="font-display-lg text-headline-md text-surface-dim group-hover:text-primary-fixed-dim transition-colors">
                  {String(idx + 1).padStart(2, '0')}
                </span>
              </div>
              
              <div className="col-span-1 flex justify-center">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer"
                  checked={selectedCandidates.includes(candidate.id)}
                  onChange={(e) => toggleCandidateSelection(e, candidate.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              <div className="col-span-4 flex items-center gap-6">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-surface-container shrink-0">
                  <img className="w-full h-full object-cover" src={getAvatar(candidate.id)} alt={candidate.name} />
                </div>
                <div>
                  <h3 className="font-headline-md text-body-lg font-bold text-on-surface">{candidate.name}</h3>
                  <p className="font-body-md text-body-md text-on-surface-variant line-clamp-1">
                    {candidate.current_title || 'Candidate'}{candidate.current_company ? ` · ${candidate.current_company}` : ''}
                  </p>
                </div>
              </div>

              <div className="col-span-3 flex flex-col items-start gap-2">
                <span className={`inline-flex items-center gap-2 px-4 py-1 rounded-full text-label-md font-medium ${
                  candidate.status === 'shortlisted' 
                    ? 'bg-primary-fixed text-on-primary-fixed-variant'
                    : candidate.status === 'invited'
                    ? 'bg-secondary-container text-on-secondary-container'
                    : candidate.status === 'processing' || candidate.status === 'interviewed'
                    ? 'bg-tertiary-container text-on-tertiary-container'
                    : 'bg-surface-container-high text-on-surface-variant'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    candidate.status === 'shortlisted' ? 'bg-primary' 
                    : candidate.status === 'invited' ? 'bg-secondary'
                    : candidate.status === 'processing' || candidate.status === 'interviewed' ? 'bg-tertiary'
                    : 'bg-surface-dim'
                  }`}></span>
                  {candidate.status === 'shortlisted' ? 'Shortlisted'
                    : candidate.status === 'invited' ? 'Invited'
                    : candidate.status === 'processing' ? 'Processing'
                    : candidate.status === 'interviewed' ? 'Interviewed'
                    : candidate.status === 'scored' ? 'Scored'
                    : 'Scraped'}
                </span>
                {candidate.status === 'shortlisted' && (
                  <button 
                    onClick={(e) => handleInvite(e, candidate.id)}
                    className="text-[12px] font-label-md text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1 rounded-full transition-colors flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">send</span> Invite
                  </button>
                )}
                {candidate.source && (
                  <span className="text-[10px] text-on-surface-variant/60 uppercase tracking-widest">{candidate.source}</span>
                )}
              </div>

              <div className="col-span-2 text-right">
                <div className="flex flex-col items-end">
                  <span className="font-display-lg text-headline-md font-bold text-primary">
                    {candidate.semantic_score ? `${Math.round(candidate.semantic_score)}%` : '--'}
                  </span>
                  <span className="font-label-caps text-[10px] text-primary/60">SEMANTIC MATCH</span>
                </div>
              </div>

              <div className="col-span-1 text-right">
                <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">
                  chevron_right
                </span>
              </div>
            </div>
          </Link>
        ))}
        
        {/* Loading Skeletons */}
        {isLoading && candidates.length === 0 && (
          <div className="space-y-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="grid grid-cols-12 items-center bg-surface border border-outline-variant/30 rounded-xl px-8 py-10 mb-4 animate-pulse">
                <div className="col-span-1"><div className="w-8 h-8 bg-surface-container rounded"></div></div>
                <div className="col-span-5 flex items-center gap-6">
                  <div className="w-16 h-16 rounded-full bg-surface-container"></div>
                  <div className="space-y-2">
                    <div className="w-32 h-4 bg-surface-container rounded"></div>
                    <div className="w-48 h-3 bg-surface-container rounded"></div>
                  </div>
                </div>
                <div className="col-span-3"><div className="w-24 h-6 bg-surface-container rounded-full"></div></div>
                <div className="col-span-2 text-right"><div className="w-12 h-8 bg-surface-container rounded ml-auto"></div></div>
                <div className="col-span-1 text-right"><div className="w-6 h-6 bg-surface-container rounded ml-auto"></div></div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && candidates.length === 0 && (
          <div className="py-24 text-center text-on-surface-variant border border-dashed border-outline-variant rounded-xl bg-surface-container-lowest flex flex-col items-center justify-center">
            <span className="material-symbols-outlined text-[64px] text-surface-dim mb-4" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>group</span>
            <p className="font-headline-md text-headline-md text-on-surface mb-2">No candidates found yet.</p>
            <p className="font-body-md text-body-md">Click "Scrape Candidates" to automatically source from LinkedIn and GitHub.</p>
          </div>
        )}
      </section>

      {/* Pagination / Footer */}
      {candidates.length > 0 && (
        <footer className="mt-stack-lg pt-stack-md border-t border-outline-variant flex justify-between items-center">
          <p className="text-on-surface-variant font-body-md text-body-md">Showing {candidates.length} candidates</p>
          <div className="flex gap-2">
            <button className="p-2 rounded hover:bg-surface-container-low text-on-surface-variant transition-colors disabled:opacity-30" disabled>
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <button className="w-10 h-10 rounded bg-primary text-on-primary font-medium text-label-md">1</button>
            <button className="p-2 rounded hover:bg-surface-container-low text-on-surface-variant transition-colors disabled:opacity-30" disabled>
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </footer>
      )}
      {/* Floating Compare Action Bar */}
      {selectedCandidates.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-surface shadow-2xl rounded-full px-6 py-4 flex items-center gap-6 border border-primary/20 z-50 atmospheric-shadow animate-fade-in">
          <div className="text-on-surface font-medium">
            <span className="text-primary font-bold">{selectedCandidates.length}</span> selected
          </div>
          <button 
            onClick={handleCompare}
            disabled={selectedCandidates.length < 2 || selectedCandidates.length > 4}
            className="px-6 py-2 rounded-full bg-primary text-on-primary font-medium hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:bg-surface-container-high disabled:text-on-surface-variant transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">compare_arrows</span>
            Compare (Min 2, Max 4)
          </button>
        </div>
      )}

      {/* Add Candidate Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-6" onClick={() => setShowAddModal(false)}>
          <div
            className="bg-surface-container-lowest rounded-xl p-8 w-full max-w-md atmospheric-shadow"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-headline-md text-headline-md mb-2">Add Candidate</h3>
            <p className="text-on-surface-variant text-sm mb-6">
              For referrals or direct applicants who didn't come from a scrape. They're added straight to the shortlist — no email needed.
            </p>
            <form onSubmit={handleManualAdd} className="space-y-4">
              <input
                type="text" required placeholder="Full name"
                className="w-full px-4 py-3 rounded-lg border border-outline-variant bg-surface focus:outline-none focus:border-primary"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              />
              <input
                type="email" required placeholder="Email address"
                className="w-full px-4 py-3 rounded-lg border border-outline-variant bg-surface focus:outline-none focus:border-primary"
                value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
              />
              <input
                type="text" placeholder="Current title (optional)"
                className="w-full px-4 py-3 rounded-lg border border-outline-variant bg-surface focus:outline-none focus:border-primary"
                value={addForm.current_title}
                onChange={(e) => setAddForm({ ...addForm, current_title: e.target.value })}
              />
              <input
                type="text" placeholder="Current company (optional)"
                className="w-full px-4 py-3 rounded-lg border border-outline-variant bg-surface focus:outline-none focus:border-primary"
                value={addForm.current_company}
                onChange={(e) => setAddForm({ ...addForm, current_company: e.target.value })}
              />
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-6 py-3 rounded-full border border-outline-variant font-medium hover:bg-surface-container-low transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="flex-1 px-6 py-3 rounded-full bg-primary text-on-primary font-medium hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {isAdding ? 'Adding...' : 'Add & Shortlist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
