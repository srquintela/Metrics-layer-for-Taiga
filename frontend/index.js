async function fetchData() {
    const response = await fetch('/api/data');
    const result = await response.json();
    return result.items || [];
}


const refreshBtn = document.getElementById('refreshBtn');
const projectView = document.getElementById('projectView');
const stats = document.getElementById('stats');
const logo = document.getElementById('logo');

async function updateProjects() {
    refreshBtn.classList.add('spinning');
    refreshBtn.disabled = true;

    try {
        const stories = await fetchData();
        const projects = [...new Set(stories.map(s => s.project))].sort((a, b) => String(a).localeCompare(String(b)));

        stats.textContent = projects.length + ' Projects';

        if (projects.length === 0) {
            projectView.innerHTML = '<div class="empty-state">Waiting for data from Python script...</div>';
            return;
        }

        projectView.innerHTML = projects.map(project => {
            const storyCount = stories.filter(s => s.project === project).length;
            const projectStr = String(project);
            const initial = projectStr.charAt(0).toUpperCase();
            return `
                <div class="project-card" data-project="${projectStr}">
                    <div class="project-icon">${initial}</div>
                    <div class="project-name">${projectStr}</div>
                    <div class="project-stats">${storyCount} User Stories</div>
                </div>
            `;
        }).join('');

        document.querySelectorAll('.project-card').forEach(card => {
            card.addEventListener('click', () => {
                const proj = card.getAttribute('data-project');
                window.location.href = `/project.html?project=${encodeURIComponent(proj)}`;
            });
        });

    } catch (err) {
        console.error('Failed to fetch projects', err);
        projectView.innerHTML = '<div class="empty-state">Error loading data. Is the server running?</div>';
    } finally {
        refreshBtn.classList.remove('spinning');
        refreshBtn.disabled = false;
    }
}

refreshBtn.addEventListener('click', updateProjects);
logo.addEventListener('click', updateProjects);

updateProjects();
