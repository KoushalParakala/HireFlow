import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';

export default function CandidateComparison() {
  const { jobId } = useParams();
  const [searchParams] = useSearchParams();
  const candidatesParam = searchParams.get('candidates');
  
  const [job, setJob] = useState(null);
  const [comparisonData, setComparisonData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [justification, setJustification] = useState(null);
  const [isJustificationLoading, setIsJustificationLoading] = useState(false);
  
  // Accordion state for questions: stores array of expanded question indices
  const [expandedQuestions, setExpandedQuestions] = useState([]);

  useEffect(() => {
    if (!candidatesParam) return;
    
    setIsLoading(true);
    setIsJustificationLoading(true);
    
    // Fetch Job
    fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/jobs/`, {
      headers: { 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' }
    })
      .then(res => res.json())
      .then(data => {
        const found = Array.isArray(data) ? data.find(j => j.id == jobId) : null;
        setJob(found);
      });
      
    // Fetch Comparison Data
    fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/candidates/compare/?ids=${candidatesParam}`, {
      headers: { 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' }
    })
      .then(res => res.json())
      .then(data => {
        setComparisonData(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setIsLoading(false);
      });

    // Fetch Justification
    fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/candidates/compare/justification?ids=${candidatesParam}`, {
      headers: { 'Authorization': 'Basic YWRtaW46aGlyZWZsb3cxMjM=' }
    })
      .then(res => res.json())
      .then(data => {
        setJustification(data.ranking_justification);
        setIsJustificationLoading(false);
      })
      .catch(err => {
        console.error(err);
        setIsJustificationLoading(false);
      });
  }, [jobId, candidatesParam]);

  const toggleQuestion = (index) => {
    setExpandedQuestions(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  // Removed getAvatar
  
  // Collect all unique questions across candidates to render the rows
  const allQuestions = [];
  comparisonData.forEach(item => {
    if (item.interview?.scorecard?.questions) {
      item.interview.scorecard.questions.forEach((q, idx) => {
        if (!allQuestions.includes(q.question)) {
          allQuestions.push(q.question);
        }
      });
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-8 md:px-20 py-stack-xl">
      {/* Header */}
      <section className="mb-stack-lg flex items-center justify-between">
        <div>
          <Link to={`/jobs/${jobId}`} className="text-primary hover:underline text-label-md font-medium mb-2 inline-block">
            ← Back to Pipeline
          </Link>
          <h1 className="font-display-lg text-display-md text-on-surface tracking-tight">
            Candidate Comparison
          </h1>
          <p className="text-on-surface-variant font-body-lg">
            Comparing {comparisonData.length} candidates for {job?.title}
          </p>
        </div>
      </section>

      {/* AI Recommendation */}
      <section className="mb-stack-lg">
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 atmospheric-shadow">
          <h2 className="font-label-caps text-label-caps text-primary mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
            AI RECOMMENDED RANKING
          </h2>
          {isJustificationLoading ? (
            <div className="flex items-center gap-3 text-on-surface-variant">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              Generating justification...
            </div>
          ) : (
            <div className="prose prose-sm max-w-none text-on-surface leading-relaxed whitespace-pre-wrap">
              {justification || "No justification available."}
            </div>
          )}
        </div>
      </section>

      {/* Comparison Grid */}
      <div className="w-full overflow-x-auto pb-8">
        <div className="min-w-max">
          
          {/* 1. Header Row: Candidate Profiles */}
          <div className="flex gap-6 mb-8">
            <div className="w-64 shrink-0"></div> {/* Empty space for row labels */}
            {comparisonData.map(({ candidate }) => (
              <div key={candidate.id} className="w-80 shrink-0 bg-surface border border-outline-variant/30 rounded-xl p-6 flex flex-col items-center text-center shadow-sm">
                <div className="w-20 h-20 rounded-full overflow-hidden mb-4 border border-outline-variant">
                  <div className="w-full h-full flex items-center justify-center font-bold text-3xl text-on-surface bg-surface-variant">
                    {candidate.name ? candidate.name.charAt(0).toUpperCase() : 'C'}
                  </div>
                </div>
                <h3 className="font-headline-md text-headline-md font-bold text-on-surface">{candidate.name}</h3>
                <p className="text-on-surface-variant text-body-md line-clamp-1">{candidate.current_title}</p>
                
                <div className="mt-4 flex items-center justify-center w-16 h-16 rounded-full bg-primary-fixed/20 border-4 border-primary-fixed">
                  <span className="font-display-lg text-headline-md font-bold text-primary">
                    {candidate.semantic_score ? Math.round(candidate.semantic_score) : '--'}
                  </span>
                </div>
                <span className="text-[10px] text-primary/80 font-label-caps mt-2">OVERALL MATCH</span>
              </div>
            ))}
          </div>

          {/* 2. Semantic Score Breakdown Row */}
          <div className="mb-8">
            <h4 className="font-label-caps text-label-caps text-on-surface-variant/70 mb-4 tracking-widest pl-4 border-l-4 border-outline-variant">
              SEMANTIC SCORING (JD CRITERIA)
            </h4>
            <div className="flex gap-6">
              <div className="w-64 shrink-0 flex flex-col justify-center text-on-surface-variant text-body-md font-medium">
                Technical Skills<br/><br/>
                Seniority<br/><br/>
                Domain Experience
              </div>
              {comparisonData.map(({ candidate }) => (
                <div key={candidate.id} className="w-80 shrink-0 bg-surface border border-outline-variant/30 rounded-xl p-6">
                  {candidate.score_breakdown ? (
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-label-sm mb-1">
                          <span className="text-on-surface-variant">Technical</span>
                          <span className="font-bold text-on-surface">{Math.round(candidate.score_breakdown.technical_skills || 0)}%</span>
                        </div>
                        <div className="w-full bg-surface-container rounded-full h-2">
                          <div className="bg-primary h-2 rounded-full" style={{ width: `${candidate.score_breakdown.technical_skills || 0}%` }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-label-sm mb-1">
                          <span className="text-on-surface-variant">Seniority</span>
                          <span className="font-bold text-on-surface">{Math.round(candidate.score_breakdown.seniority || 0)}%</span>
                        </div>
                        <div className="w-full bg-surface-container rounded-full h-2">
                          <div className="bg-secondary h-2 rounded-full" style={{ width: `${candidate.score_breakdown.seniority || 0}%` }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-label-sm mb-1">
                          <span className="text-on-surface-variant">Domain</span>
                          <span className="font-bold text-on-surface">{Math.round(candidate.score_breakdown.domain_experience || 0)}%</span>
                        </div>
                        <div className="w-full bg-surface-container rounded-full h-2">
                          <div className="bg-tertiary h-2 rounded-full" style={{ width: `${candidate.score_breakdown.domain_experience || 0}%` }}></div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-on-surface-variant py-4">No data</div>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* 3. Interview Scorecard Dimensions */}
          <div className="mb-8">
            <h4 className="font-label-caps text-label-caps text-on-surface-variant/70 mb-4 tracking-widest pl-4 border-l-4 border-outline-variant">
              INTERVIEW SCORECARD
            </h4>
            <div className="flex gap-6">
              <div className="w-64 shrink-0 flex flex-col justify-center text-on-surface-variant text-body-md font-medium">
                Overall Interview Average
              </div>
              {comparisonData.map(({ candidate, interview }) => (
                <div key={candidate.id} className="w-80 shrink-0 bg-surface border border-outline-variant/30 rounded-xl p-6 text-center">
                  {interview?.status === 'scored' && interview.scorecard ? (
                    <div>
                      <div className="text-display-md font-display-lg text-primary mb-2">
                        {Math.round(interview.scorecard.overall_average || 0)}%
                      </div>
                      <span className={`inline-flex px-3 py-1 rounded-full text-label-sm font-medium ${
                        interview.scorecard.questions?.[0]?.hire_signal === 'hire' ? 'bg-primary-fixed text-primary' : 'bg-error-container text-error'
                      }`}>
                        {interview.scorecard.questions?.[0]?.hire_signal?.toUpperCase() || 'N/A'}
                      </span>
                    </div>
                  ) : (
                    <div className="text-on-surface-variant/50 flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined text-[32px]">pending_actions</span>
                      {interview?.status === 'processing' ? 'Processing...' : 'Not completed'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 4. Interactive Questions Accordion */}
          {allQuestions.length > 0 && (
            <div className="mb-8">
              <h4 className="font-label-caps text-label-caps text-on-surface-variant/70 mb-4 tracking-widest pl-4 border-l-4 border-outline-variant">
                ANSWER SUMMARIES
              </h4>
              
              <div className="space-y-4">
                {allQuestions.map((q, idx) => {
                  const isExpanded = expandedQuestions.includes(idx);
                  return (
                    <div key={idx} className="bg-surface border border-outline-variant/30 rounded-xl overflow-hidden">
                      {/* Accordion Header */}
                      <button 
                        onClick={() => toggleQuestion(idx)}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-surface-container-lowest transition-colors text-left"
                      >
                        <div className="flex items-start gap-4 pr-4">
                          <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center font-bold text-on-surface-variant shrink-0 mt-1">
                            Q{idx + 1}
                          </div>
                          <span className="font-headline-md text-body-lg font-medium text-on-surface pt-1">{q}</span>
                        </div>
                        <span className="material-symbols-outlined text-on-surface-variant shrink-0">
                          {isExpanded ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>
                      
                      {/* Accordion Body */}
                      {isExpanded && (
                        <div className="border-t border-outline-variant/30 px-6 py-6 bg-surface-container-lowest flex gap-6">
                          <div className="w-64 shrink-0"></div> {/* Offset */}
                          
                          {comparisonData.map(({ candidate, interview }) => {
                            const answerData = interview?.scorecard?.questions?.find(ans => ans.question === q);
                            return (
                              <div key={candidate.id} className="w-80 shrink-0">
                                {answerData ? (
                                  <div className="space-y-3">
                                    <p className="text-body-md text-on-surface">{answerData.summary}</p>
                                    <div className="grid grid-cols-2 gap-2 text-label-sm pt-2 border-t border-outline-variant/30">
                                      <div className="flex justify-between">
                                        <span className="text-on-surface-variant">Relevance</span>
                                        <span className="font-medium text-on-surface">{answerData.scores?.relevance || 0}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-on-surface-variant">Clarity</span>
                                        <span className="font-medium text-on-surface">{answerData.scores?.clarity || 0}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-on-surface-variant">Specificity</span>
                                        <span className="font-medium text-on-surface">{answerData.scores?.specificity || 0}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-on-surface-variant">Depth</span>
                                        <span className="font-medium text-on-surface">{answerData.scores?.depth || 0}</span>
                                      </div>
                                    </div>
                                    {answerData.follow_up_questions?.length > 0 && (
                                      <div className="pt-2">
                                        <span className="text-label-sm font-medium text-primary">Follow-up:</span>
                                        <ul className="list-disc pl-4 mt-1 space-y-1">
                                          {answerData.follow_up_questions.map((fq, i) => (
                                            <li key={i} className="text-label-sm text-on-surface-variant">{fq}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-on-surface-variant/50 text-body-sm italic">No answer data available.</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
