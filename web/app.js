const API_BASE = 'http://localhost:8000/api';

// State
let currentJobId = null;

// DOM Elements
const jobForm = document.getElementById('job-form');
const jobCreationSection = document.getElementById('job-creation-section');
const jobDashboard = document.getElementById('job-dashboard');
const candidatesSection = document.getElementById('candidates-section');
const displayTitle = document.getElementById('display-title');
const criteriaContainer = document.getElementById('criteria-container');
const jobIdBadge = document.getElementById('job-id-badge');
const scrapeBtn = document.getElementById('scrape-btn');
const scoreBtn = document.getElementById('score-btn');
const statusMessage = document.getElementById('status-message');
const candidatesContainer = document.getElementById('candidates-container');
const refreshCandidatesBtn = document.getElementById('refresh-candidates-btn');

// Helper to show status message
function showMessage(msg, isError = false) {
    statusMessage.textContent = msg;
    statusMessage.className = `status-msg ${isError ? 'status-error' : 'status-success'}`;
    statusMessage.classList.remove('hidden');
    setTimeout(() => {
        statusMessage.classList.add('hidden');
    }, 5000);
}

// Helper to toggle button loading state
function toggleButtonLoading(btn, isLoading) {
    const textSpan = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.spinner');
    
    if (isLoading) {
        textSpan.classList.add('hidden');
        spinner.classList.remove('hidden');
        btn.disabled = true;
    } else {
        textSpan.classList.remove('hidden');
        spinner.classList.add('hidden');
        btn.disabled = false;
    }
}

// 1. Create Job
jobForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-job-btn');
    toggleButtonLoading(btn, true);
    
    const title = document.getElementById('title').value;
    const description = document.getElementById('description').value;

    try {
        const response = await fetch(`${API_BASE}/jobs/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description })
        });
        
        if (!response.ok) throw new Error('Failed to create job');
        
        const data = await response.json();
        currentJobId = data.job_id;
        
        // Transition UI
        jobCreationSection.classList.add('hidden');
        jobDashboard.classList.remove('hidden');
        
        // Populate Dashboard
        displayTitle.textContent = title;
        jobIdBadge.textContent = `Job #${currentJobId}`;
        
        // Render Criteria Tags
        criteriaContainer.innerHTML = '';
        if (data.criteria) {
            const renderTags = (label, arr) => {
                if (!arr || !arr.length) return;
                arr.forEach(item => {
                    const el = document.createElement('div');
                    el.className = 'tag';
                    el.innerHTML = `<span>${label}</span> ${item}`;
                    criteriaContainer.appendChild(el);
                });
            };
            
            renderTags('Req', data.criteria.required_skills);
            renderTags('Pref', data.criteria.preferred_skills);
            
            if (data.criteria.experience_range) {
                const el = document.createElement('div');
                el.className = 'tag';
                el.innerHTML = `<span>Exp</span> ${data.criteria.experience_range}`;
                criteriaContainer.appendChild(el);
            }
        }
        
        showMessage('Job analyzed and created successfully!');
    } catch (err) {
        showMessage(err.message, true);
    } finally {
        toggleButtonLoading(btn, false);
    }
});

// 2. Scrape Candidates
scrapeBtn.addEventListener('click', async () => {
    if (!currentJobId) return;
    
    toggleButtonLoading(scrapeBtn, true);
    try {
        const response = await fetch(`${API_BASE}/jobs/${currentJobId}/scrape`, {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error('Failed to scrape candidates');
        
        const data = await response.json();
        showMessage(data.message);
        
        scoreBtn.classList.remove('hidden');
        await loadCandidates();
    } catch (err) {
        showMessage(err.message, true);
    } finally {
        toggleButtonLoading(scrapeBtn, false);
    }
});

// 3. Score Candidates
scoreBtn.addEventListener('click', async () => {
    if (!currentJobId) return;
    
    toggleButtonLoading(scoreBtn, true);
    try {
        const response = await fetch(`${API_BASE}/jobs/${currentJobId}/score`, {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error('Failed to score candidates');
        
        const data = await response.json();
        showMessage(data.message);
        
        await loadCandidates();
    } catch (err) {
        showMessage(err.message, true);
    } finally {
        toggleButtonLoading(scoreBtn, false);
    }
});

// 4. Load & Render Candidates
async function loadCandidates() {
    if (!currentJobId) return;
    
    try {
        const response = await fetch(`${API_BASE}/candidates/?job_id=${currentJobId}`);
        if (!response.ok) throw new Error('Failed to fetch candidates');
        
        const candidates = await response.json();
        candidatesSection.classList.remove('hidden');
        renderCandidates(candidates);
    } catch (err) {
        console.error(err);
    }
}

refreshCandidatesBtn.addEventListener('click', () => {
    const icon = refreshCandidatesBtn;
    icon.style.transform = 'rotate(180deg)';
    setTimeout(() => { icon.style.transform = 'none'; }, 300);
    loadCandidates();
});

function getScoreBadgeHtml(score) {
    if (score == null) return `<div class="score-badge score-none">Unscored</div>`;
    
    let cls = 'score-low';
    if (score >= 80) cls = 'score-high';
    else if (score >= 50) cls = 'score-med';
    
    return `<div class="score-badge ${cls}">Score: ${score}/100</div>`;
}

function renderCandidates(candidates) {
    candidatesContainer.innerHTML = '';
    
    if (candidates.length === 0) {
        candidatesContainer.innerHTML = '<p class="subtitle">No candidates found yet.</p>';
        return;
    }
    
    // Sort by score if available
    candidates.sort((a, b) => (b.semantic_score || 0) - (a.semantic_score || 0));
    
    candidates.forEach(c => {
        const card = document.createElement('div');
        card.className = 'candidate-card';
        
        const title = c.current_title ? `${c.current_title} @ ${c.current_company || 'Unknown'}` : (c.current_company || 'No Company Info');
        
        card.innerHTML = `
            <div class="card-header">
                <h4>${c.name || 'Unknown Candidate'}</h4>
                <div class="card-subtitle">${title}</div>
                ${getScoreBadgeHtml(c.semantic_score)}
            </div>
            <div class="card-body">
                <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
                    ${c.experience_summary || 'No summary available.'}
                </p>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${(c.skills || []).slice(0, 3).map(s => `<span class="tag" style="padding: 0.1rem 0.4rem; font-size: 0.75rem;">${s}</span>`).join('')}
                    ${(c.skills || []).length > 3 ? `<span class="tag" style="padding: 0.1rem 0.4rem; font-size: 0.75rem;">+${c.skills.length - 3}</span>` : ''}
                </div>
            </div>
            <div class="card-footer">
                ${c.profile_url ? `<a href="${c.profile_url}" target="_blank" class="profile-link">View Profile</a>` : '<span></span>'}
                <button class="secondary-btn shortlist-btn" onclick="shortlistCandidate(${c.id}, this)" ${c.status === 'shortlisted' ? 'disabled' : ''}>
                    ${c.status === 'shortlisted' ? 'Shortlisted' : 'Shortlist'}
                </button>
            </div>
        `;
        
        candidatesContainer.appendChild(card);
    });
}

// Expose globally for inline onclick
window.shortlistCandidate = async function(id, btn) {
    btn.disabled = true;
    btn.textContent = '...';
    
    try {
        const response = await fetch(`${API_BASE}/candidates/${id}/shortlist`, {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error('Failed to shortlist');
        btn.textContent = 'Shortlisted';
        showMessage('Candidate shortlisted successfully!');
    } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Shortlist';
        showMessage(err.message, true);
    }
};
