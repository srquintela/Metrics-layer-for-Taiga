async function checkAuth() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();
        if (!settings.auth_token) {
            console.warn('[AUTH] No auth token found, redirecting to settings...');
            window.location.href = 'settings.html';
            return false;
        }
        return true;
    } catch (e) {
        console.error('[AUTH] Failed to check settings:', e);
        window.location.href = 'settings.html';
        return false;
    }
}

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
        console.log('[DEBUG] Fetching project list...');
        const response = await fetch('/api/projects');
        if (!response.ok) {
            throw new Error('Failed to fetch projects');
        }
        const projects = await response.json();

        stats.textContent = projects.length + ' Proyectos';

        if (projects.length === 0) {
            console.warn('[WARN] No projects found');
            projectView.innerHTML = '<div class="empty-state">No se encontraron proyectos para este usuario.</div>';
            return;
        }

        projectView.innerHTML = projects.map(project => {
            const projectStr = String(project.name);
            const projectId = project.id;
            const initial = projectStr.charAt(0).toUpperCase();
            return `
                <div class="project-card" data-project="${projectStr}" data-id="${projectId}">
                    <div class="project-icon">${initial}</div>
                    <div class="project-name">${projectStr}</div>
                    <div class="project-actions">
                        <button class="action-btn kanban-btn" onclick="event.stopPropagation(); window.location.href='/project.html?project=${encodeURIComponent(projectStr)}&id=${projectId}'">Kanban</button>
                        <button class="action-btn scrum-btn" onclick="event.stopPropagation(); window.location.href='/scrum.html?project=${encodeURIComponent(projectStr)}&id=${projectId}'">Scrum</button>
                    </div>
                </div>
            `;
        }).join('');

        document.querySelectorAll('.project-card').forEach(card => {
            card.addEventListener('click', () => {
                const proj = card.getAttribute('data-project');
                const id = card.getAttribute('data-id');
                window.location.href = `/project.html?project=${encodeURIComponent(proj)}&id=${id}`;
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

checkAuth().then(authenticated => {
    if (authenticated) {
        updateProjects();
    }
});
