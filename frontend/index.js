async function fetchData() {
    const response = await fetch('/api/data');
    if (!response.ok) {
        console.error('[ERROR] Failed to fetch data:', response.status);
    }
    const result = await response.json();
    console.log('[DEBUG] Fetched data:', result);
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
        console.log('[DEBUG] Triggering data refresh...');
        // Trigger data refresh in the backend
        const refreshRes = await fetch('/api/refresh', { method: 'POST' });
        
        if (!refreshRes.ok) {
            let errorMsg = 'Refresh failed';
            try {
                const error = await refreshRes.json();
                errorMsg = error.message || errorMsg;
                console.error('[ERROR] Refresh failed details:', error);
            } catch (e) {
                console.error('[ERROR] Could not parse refresh error response');
            }
            throw new Error(errorMsg);
        }

        console.log('[DEBUG] Refresh triggered successfully, fetching stories...');
        const stories = await fetchData();
        const projects = [...new Set(stories.map(s => s.project))].sort((a, b) => String(a).localeCompare(String(b)));

        stats.textContent = projects.length + ' Proyectos';

        if (projects.length === 0) {
            console.warn('[WARN] No projects found in dataStore');
            projectView.innerHTML = '<div class="empty-state">Esperando datos del script de Python...</div>';
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
                    <div class="project-stats">${storyCount} Historias de Usuario</div>
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
        console.error('[ERROR] Error al cargar proyectos:', err);
        projectView.innerHTML = `<div class="empty-state">Error al cargar datos: ${err.message}<br><br>Revise la consola del navegador para más detalles.</div>`;
    } finally {
        refreshBtn.classList.remove('spinning');
        refreshBtn.disabled = false;
    }
}

refreshBtn.addEventListener('click', updateProjects);
logo.addEventListener('click', updateProjects);

updateProjects();
