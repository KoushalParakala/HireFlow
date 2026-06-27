import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function JobOverview() {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobDescription, setNewJobDescription] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  useEffect(() => {
    // Fetch all jobs from backend
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

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/jobs/`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM='
        },
        body: JSON.stringify({
          title: newJobTitle,
          description: newJobDescription,
        })
      });
      const data = await res.json();
      setJobs([{ id: data.job_id, title: newJobTitle, candidate_count: 0 }, ...jobs]);
      setNewJobTitle('');
      setNewJobDescription('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="pt-16 pb-stack-xl max-w-7xl mx-auto px-4 md:px-margin-page">
      {/* Hero Section / Editorial Header */}
      <section className="mb-stack-lg flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="font-display-lg text-display-lg-mobile md:text-display-lg mb-4 tracking-tighter max-w-2xl">
            Talent Pipeline Overview
          </h1>
          <p className="text-on-surface-variant max-w-xl font-body-lg text-body-lg">
            Your hiring velocity is currently <span className="text-primary font-semibold">12% higher</span> than last month. 
            Focus on the pending screenings to maintain momentum.
          </p>
        </div>
        <button 
          onClick={() => {
            setNewJobTitle('');
            setNewJobDescription('');
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          }}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-white font-medium transition-all hover:opacity-90 active:scale-95 shadow-lg shadow-primary/10 w-fit"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Post New Role
        </button>
      </section>

      {/* High-Level Metrics (Bento Grid Style) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-stack-xl">
        <div className="p-8 border-l border-outline-variant bg-surface-container-lowest">
          <p className="font-label-caps text-label-caps text-on-surface-variant mb-6 uppercase">Active Jobs</p>
          <div className="font-display-lg text-display-lg tracking-tighter text-on-surface">{jobs.length || '24'}</div>
          <div className="mt-4 flex items-center gap-2 text-primary">
            <span className="material-symbols-outlined text-sm">trending_up</span>
            <span className="text-sm font-medium">+2 this week</span>
          </div>
        </div>
        <div className="p-8 border-l border-outline-variant bg-surface-container-lowest">
          <p className="font-label-caps text-label-caps text-on-surface-variant mb-6 uppercase">Screened</p>
          <div className="font-display-lg text-display-lg tracking-tighter text-on-surface">142</div>
          <div className="mt-4 flex items-center gap-2 text-on-surface-variant">
            <span className="text-sm font-medium">Across all departments</span>
          </div>
        </div>
        <div className="p-8 border-l border-outline-variant bg-surface-container-lowest">
          <p className="font-label-caps text-label-caps text-on-surface-variant mb-6 uppercase">Pending</p>
          <div className="font-display-lg text-display-lg tracking-tighter text-primary">09</div>
          <div className="mt-4 flex items-center gap-2 text-error">
            <span className="material-symbols-outlined text-sm">priority_high</span>
            <span className="text-sm font-medium">Action required</span>
          </div>
        </div>
      </section>

      {/* Create New Job */}
      <section className="mb-16 bg-surface-container-low p-8 rounded-xl border border-outline-variant/30 atmospheric-shadow">
        <h2 className="font-headline-md text-headline-md tracking-tight mb-6">Post a New Role</h2>
        <form onSubmit={handlePostJob} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Job Title (e.g. Senior Full Stack Engineer)"
            className="px-4 py-3 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md focus:ring-2 focus:ring-primary focus:outline-none transition-shadow"
            value={newJobTitle}
            onChange={(e) => setNewJobTitle(e.target.value)}
            required
          />
          <textarea
            placeholder="Paste Job Description here..."
            className="px-4 py-3 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-body-md h-32 focus:ring-2 focus:ring-primary focus:outline-none transition-shadow resize-y"
            value={newJobDescription}
            onChange={(e) => setNewJobDescription(e.target.value)}
            required
          ></textarea>
          <button 
            type="submit" 
            disabled={isPosting}
            className="self-end px-8 py-3 rounded-full bg-primary text-on-primary font-medium transition-all hover:opacity-90 active:scale-95 shadow-lg shadow-primary/10 disabled:opacity-50"
          >
            {isPosting ? 'Posting...' : 'Create Job'}
          </button>
        </form>
      </section>

      {/* Job Listings */}
      <section>
        <div className="flex justify-between items-end mb-8">
          <h2 className="font-headline-md text-headline-md tracking-tight">Active Listings</h2>
          <button className="text-primary font-semibold flex items-center gap-1 hover:underline">
            View all <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>

        <div className="space-y-4">
          {isLoading && (
            <div className="py-12 text-center text-on-surface-variant flex justify-center items-center gap-2">
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              <span>Loading pipeline...</span>
            </div>
          )}

          {!isLoading && jobs.map((job) => (
            <Link to={`/jobs/${job.id}`} key={job.id} className="block">
              <div className="ambient-card group p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between border-b border-outline-variant/30 cursor-pointer">
                <div className="mb-4 md:mb-0">
                  <h3 className="font-headline-md text-headline-md text-2xl group-hover:text-primary transition-colors">
                    {job.title}
                  </h3>
                  <p className="text-on-surface-variant mt-1">Engineering · Remote · Just posted</p>
                </div>
                
                <div className="flex items-center gap-12">
                  <div className="text-center">
                    <span className="block font-bold text-xl">{job.candidate_count || 0}</span>
                    <span className="text-on-surface-variant text-xs uppercase tracking-widest">Candidates</span>
                  </div>
                  
                  <div className="w-32 h-1 bg-surface-container rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, (job.candidate_count || 0) * 5)}%` }}></div>
                  </div>
                  
                  <div className="hidden md:block">
                    <span className="px-4 py-2 border border-outline-variant rounded-full text-sm font-medium group-hover:border-primary transition-colors">
                      {job.candidate_count > 0 ? 'Interviewing' : 'New Posting'}
                    </span>
                  </div>
                  
                  <span className="material-symbols-outlined text-on-surface-variant group-hover:translate-x-1 transition-transform">
                    chevron_right
                  </span>
                </div>
              </div>
            </Link>
          ))}

          {!isLoading && jobs.length === 0 && (
            <p className="text-on-surface-variant italic py-8 text-center">No active listings yet. Create a job above.</p>
          )}
        </div>
      </section>

      {/* Team Insights Section */}
      <section className="mt-stack-xl flex flex-col md:flex-row gap-16 items-center">
        <div className="w-full md:w-1/2">
          <div className="aspect-video bg-surface-container-high relative overflow-hidden rounded-lg">
            <img 
              className="w-full h-full object-cover grayscale opacity-50" 
              src="https://images.unsplash.com/photo-1497215728101-856f4ea42174?q=80&w=1000&auto=format&fit=crop" 
              alt="Professional workplace"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white/80 to-transparent"></div>
          </div>
        </div>
        
        <div className="w-full md:w-1/2">
          <p className="font-label-caps text-label-caps text-primary mb-4">Talent Analytics</p>
          <h2 className="font-display-lg text-display-lg-mobile md:text-headline-md mb-6 leading-tight">
            Identify the best fit with AI-powered matching.
          </h2>
          <p className="text-body-lg text-on-surface-variant mb-8">
            Our Streamline engine analyzes technical proficiency and culture add scores automatically, surfacing candidates that match your existing top performers.
          </p>
          <a className="inline-flex items-center justify-center h-14 px-8 bg-on-surface text-surface font-semibold rounded-full hover:bg-primary transition-colors" href="#">
            Explore Analytics
          </a>
        </div>
      </section>
    </div>
  );
}
