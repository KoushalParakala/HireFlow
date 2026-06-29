import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function JobOverview() {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobDescription, setNewJobDescription] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState('');

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/jobs/`, {
      headers: { 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' }
    })
      .then(res => res.json())
      .then(data => {
        setJobs(Array.isArray(data) ? data : []);
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setIsLoading(false);
      });
  }, []);

  const handlePostJob = async (e) => {
    e.preventDefault();
    if (!newJobTitle || !newJobDescription) return;
    setIsPosting(true);
    setPostError('');

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/jobs/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM='
        },
        body: JSON.stringify({ title: newJobTitle, description: newJobDescription }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPostError(data.detail || 'Failed to create job');
      } else {
        setJobs([{ id: data.job_id, title: newJobTitle, candidate_count: 0 }, ...jobs]);
        setNewJobTitle('');
        setNewJobDescription('');
      }
    } catch (err) {
      setPostError('Network error. Is the backend running?');
      console.error(err);
    } finally {
      setIsPosting(false);
    }
  };

  const insertTemplate = () => {
    setNewJobDescription(prev => prev + (prev ? '\n\n' : '') +
      `## Responsibilities\n- Lead development of key features\n- Collaborate with cross-functional teams\n\n## Requirements\n- 3+ years of relevant experience\n- Strong communication skills\n\n## Nice to Have\n- Experience with modern tooling\n- Open source contributions`
    );
  };

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-12 md:py-16 max-w-container-max mx-auto">

      {/* ── Hero Header ── */}
      <section className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <span className="font-label-bold text-label-bold text-on-surface-variant tracking-widest uppercase">
            Dashboard
          </span>
          <h1 className="font-display-lg-mobile text-display-lg-mobile md:font-display-lg md:text-display-lg text-primary mt-2 mb-3">
            Talent Pipeline
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
            Your hiring velocity is{' '}
            <span className="text-primary font-semibold">12% higher</span> than last month.
            Focus on pending screenings to maintain momentum.
          </p>
        </div>
        <button
          onClick={() => setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50)}
          className="flex items-center gap-2 px-8 py-4 rounded-xl bg-secondary-container text-primary font-label-bold text-label-bold hover:opacity-90 active:scale-[0.98] transition-all shadow-[0_8px_30px_rgba(252,138,64,0.2)] w-fit shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Post New Role
        </button>
      </section>

      {/* ── Metrics Bento Grid ── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-12">
        {[
          {
            label: 'Active Jobs',
            value: jobs.length,
            sub: '+2 this week',
            subColor: 'text-primary',
            icon: 'trending_up',
          },
          {
            label: 'Screened',
            value: jobs.reduce((acc, job) => acc + (job.candidate_count || 0), 0),
            sub: 'Across all departments',
            subColor: 'text-on-surface-variant',
            icon: null,
          },
          {
            label: 'Pending Interviews',
            value: Math.round(jobs.reduce((acc, job) => acc + ((job.candidate_count || 0) * (1 - (job.interview_completion_rate || 0) / 100)), 0)),
            sub: 'Action required',
            subColor: 'text-error',
            icon: 'priority_high',
          },
        ].map((m, i) => (
          <div key={i} className="bg-surface-container-lowest rounded-3xl p-8 ambient-shadow border border-outline-variant/20">
            <p className="font-label-bold text-label-bold text-on-surface-variant uppercase tracking-widest mb-4">{m.label}</p>
            <div className="font-display-lg text-display-lg text-primary leading-none mb-4">{m.value}</div>
            <div className={`flex items-center gap-1.5 font-label-sm text-label-sm ${m.subColor}`}>
              {m.icon && <span className="material-symbols-outlined text-[16px]">{m.icon}</span>}
              {m.sub}
            </div>
          </div>
        ))}
      </section>

      {/* ── Active Listings ── */}
      <section className="mb-12">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-headline-md text-headline-md text-primary">Active Listings</h2>
          <span className="font-label-sm text-label-sm text-on-surface-variant">
            {jobs.length} {jobs.length === 1 ? 'role' : 'roles'}
          </span>
        </div>

        <div className="space-y-3">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map(n => (
                <div key={n} className="bg-surface-container-lowest rounded-2xl p-6 animate-pulse flex gap-6 items-center">
                  <div className="w-12 h-12 rounded-xl bg-surface-container-high shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="w-40 h-5 bg-surface-container-high rounded" />
                    <div className="w-24 h-3.5 bg-surface-container-high rounded" />
                  </div>
                  <div className="w-16 h-8 bg-surface-container-high rounded" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && jobs.map((job) => (
            <Link to={`/jobs/${job.id}`} key={job.id} className="block group">
              <div className="bg-surface-container-lowest rounded-2xl px-6 py-5 ambient-shadow border border-outline-variant/20 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-primary/20 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all">
                {/* Left: Icon + Info */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 0" }}>work</span>
                  </div>
                  <div>
                    <h3 className="font-headline-md text-[18px] font-semibold text-primary group-hover:text-primary transition-colors">
                      {job.title}
                    </h3>
                    <p className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">
                      Engineering · Remote · Just posted
                    </p>
                  </div>
                </div>

                {/* Right: Stats */}
                <div className="flex items-center gap-6 md:gap-10">
                  <div className="text-center">
                    <span className="block font-headline-md text-[20px] font-bold text-primary">{job.candidate_count || 0}</span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">Candidates</span>
                  </div>
                  <div className="text-center hidden md:block">
                    <span className="block font-headline-md text-[20px] font-bold text-secondary">
                      {job.average_semantic_score ? job.average_semantic_score + '%' : '--'}
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">Avg Match</span>
                  </div>
                  <div className="text-center hidden md:block">
                    <span className="block font-headline-md text-[20px] font-bold text-on-surface-variant">
                      {job.interview_completion_rate || 0}%
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">Completion</span>
                  </div>
                  <span className="px-3 py-1.5 rounded-full bg-surface-container-low font-label-sm text-label-sm text-on-surface-variant hidden md:block border border-outline-variant/30 group-hover:border-primary/20 transition-colors">
                    {job.candidate_count > 0 ? 'In Progress' : 'New Posting'}
                  </span>
                  <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                    chevron_right
                  </span>
                </div>
              </div>
            </Link>
          ))}

          {!isLoading && jobs.length === 0 && (
            <div className="py-24 text-center border border-dashed border-outline-variant rounded-2xl bg-surface-container-lowest flex flex-col items-center justify-center">
              <span className="material-symbols-outlined text-[64px] text-surface-dim mb-4" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200" }}>
                work_outline
              </span>
              <p className="font-headline-md text-[18px] font-semibold text-primary mb-2">No active listings yet</p>
              <p className="font-body-md text-body-md text-on-surface-variant">Create your first role below.</p>
            </div>
          )}
        </div>
      </section>

      {/* ── Create Job Form ── */}
      <section id="post-job">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter lg:gap-16 items-start">
          {/* Form */}
          <div className="lg:col-span-7 flex flex-col gap-8">
            <div>
              <span className="font-label-bold text-label-bold text-on-surface-variant tracking-widest uppercase">New Posting</span>
              <h2 className="font-display-lg-mobile text-display-lg-mobile text-primary mt-2 mb-2">Create Job Posting</h2>
              <p className="font-body-lg text-body-lg text-on-surface-variant">
                Define the role requirements. Our system will generate a targeted candidate pipeline.
              </p>
            </div>

            <form onSubmit={handlePostJob} className="flex flex-col gap-6 max-w-2xl">
              {/* Job Title */}
              <div className="flex flex-col gap-2 input-focus-shadow rounded-xl transition-shadow duration-300">
                <label className="font-label-bold text-label-bold text-primary pl-1" htmlFor="job-title-input">
                  Job Title
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-4 text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 0" }}>work</span>
                  <input
                    id="job-title-input"
                    type="text"
                    placeholder="e.g. Senior Frontend Engineer"
                    className="w-full bg-surface-variant rounded-xl border border-transparent focus:border-primary focus:bg-surface-container-lowest outline-none py-4 pl-12 pr-4 font-body-md text-body-md text-on-surface placeholder:text-outline transition-all duration-300"
                    value={newJobTitle}
                    onChange={(e) => setNewJobTitle(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Job Description */}
              <div className="flex flex-col gap-2 input-focus-shadow rounded-xl transition-shadow duration-300">
                <label className="font-label-bold text-label-bold text-primary pl-1 flex justify-between" htmlFor="job-description-input">
                  <span>Description & Requirements</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-normal tracking-normal lowercase">Markdown supported</span>
                </label>
                <textarea
                  id="job-description-input"
                  placeholder="Detail the responsibilities, required skills, and what makes this role unique..."
                  className="w-full bg-surface-variant rounded-xl border border-transparent focus:border-primary focus:bg-surface-container-lowest outline-none p-5 font-body-md text-body-md text-on-surface placeholder:text-outline transition-all duration-300 resize-y min-h-[220px]"
                  rows={10}
                  value={newJobDescription}
                  onChange={(e) => setNewJobDescription(e.target.value)}
                  required
                />
              </div>

              {/* Formatting Toolbar */}
              <div className="flex items-center gap-2 px-1">
                <button type="button" aria-label="Bold" onClick={() => setNewJobDescription(d => d + '**bold**')}
                  className="p-2 rounded-lg hover:bg-surface-variant text-on-surface-variant transition-colors">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>format_bold</span>
                </button>
                <button type="button" aria-label="Italic" onClick={() => setNewJobDescription(d => d + '_italic_')}
                  className="p-2 rounded-lg hover:bg-surface-variant text-on-surface-variant transition-colors">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>format_italic</span>
                </button>
                <button type="button" aria-label="List" onClick={() => setNewJobDescription(d => d + '\n- ')}
                  className="p-2 rounded-lg hover:bg-surface-variant text-on-surface-variant transition-colors">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>format_list_bulleted</span>
                </button>
                <div className="w-px h-6 bg-outline-variant mx-2" />
                <button type="button" onClick={insertTemplate}
                  className="p-2 rounded-lg hover:bg-surface-variant text-on-surface-variant transition-colors flex items-center gap-2">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>description</span>
                  <span className="font-label-sm text-label-sm">Insert Template</span>
                </button>
              </div>

              {/* Error */}
              {postError && (
                <div className="px-4 py-3 rounded-xl bg-error-container/30 border border-error/20 text-error font-label-sm text-label-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  {postError}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-4 pt-4 mt-2 border-t border-surface-variant">
                <button
                  type="button"
                  onClick={() => { setNewJobTitle(''); setNewJobDescription(''); }}
                  className="px-6 py-4 rounded-xl font-label-bold text-label-bold text-on-surface hover:bg-surface-variant transition-colors"
                >
                  Clear
                </button>
                <button
                  type="submit"
                  disabled={isPosting}
                  className="px-8 py-4 rounded-xl bg-secondary-container text-on-secondary-container font-label-bold text-label-bold hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-[0_8px_30px_rgba(252,138,64,0.2)] disabled:opacity-50"
                >
                  {isPosting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-on-secondary-container border-t-transparent rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <span>Generate Pipeline</span>
                      <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 0" }}>arrow_forward</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Illustration */}
          <div className="hidden lg:flex lg:col-span-5 items-center justify-center sticky top-32">
            <div className="w-full max-w-md aspect-square relative flex items-center justify-center">
              <div className="absolute inset-0 bg-surface-container rounded-full blur-3xl opacity-50 scale-110" />
              <svg aria-hidden="true" className="w-full h-full relative z-10" viewBox="0 0 400 400">
                <circle cx="200" cy="200" fill="none" r="180" stroke="#dce2f3" strokeDasharray="4 8" strokeWidth="1" />
                <circle cx="200" cy="200" fill="none" r="120" stroke="#dce2f3" strokeWidth="1" />
                <path d="M 200 40 A 160 160 0 0 1 360 200" fill="none" stroke="#000000" strokeLinecap="round" strokeWidth="3" />
                <path d="M 40 200 A 160 160 0 0 1 120 61" fill="none" stroke="#c6c6ca" strokeDasharray="10 15" strokeLinecap="round" strokeWidth="2" />
                <circle cx="200" cy="200" fill="#000000" r="40" />
                <circle cx="200" cy="200" fill="#ffffff" r="12" />
                <g transform="translate(300, 100)">
                  <circle cx="0" cy="0" fill="#fc8a40" fillOpacity="0.2" r="24" />
                  <circle cx="0" cy="0" fill="#fc8a40" r="8" />
                  <line opacity="0.6" stroke="#fc8a40" strokeDasharray="4 4" strokeWidth="1.5" x1="-100" x2="-8" y1="100" y2="8" />
                </g>
                <g transform="translate(120, 280)">
                  <circle cx="0" cy="0" fill="#07006c" fillOpacity="0.1" r="16" />
                  <circle cx="0" cy="0" fill="#07006c" r="6" />
                  <line opacity="0.3" stroke="#07006c" strokeWidth="1" x1="80" x2="6" y1="-80" y2="-6" />
                </g>
                <g transform="translate(320, 260)">
                  <rect fill="#f0f3ff" height="20" rx="4" stroke="#000000" strokeWidth="2" transform="rotate(45)" width="20" x="-10" y="-10" />
                </g>
                <circle cx="200" cy="200" fill="none" opacity="0.5" r="60" stroke="#fc8a40" strokeWidth="2">
                  <animate attributeName="r" dur="4s" repeatCount="indefinite" values="40; 80; 40" />
                  <animate attributeName="opacity" dur="4s" repeatCount="indefinite" values="0.8; 0; 0.8" />
                </circle>
              </svg>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
