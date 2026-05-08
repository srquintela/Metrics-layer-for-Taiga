async function fetchData() {
    const response = await fetch('/api/data');
    const result = await response.json();
    return result.items || [];
}

// Editable status groups for metrics
// Tiempo en Progreso
const IN_PROGRESS_STATUSES = [
    'En Progreso'
];

// Tiempo en QA
const QA_STATUSES = [
    'Enviado a QA',
    'Control de Calidad',
    'Listo para Testear',
    'Listo para Revision'
];

// Extra statuses that are part of "Proceso" but not in progress/QA
const EXTRA_PROCESS_STATUSES = [
    'Pruebas de Usuario',
    'Espera Usuario'
];

function statusMatchesAny(name, list) {
    if (!name) return false;
    return list.some(s => isStatusName(name, s));
}

async function fetchHistory(id) {
    const token = sessionStorage.getItem('auth_token');
    const userId = sessionStorage.getItem('user_id');
    if (!token || !userId) {
        throw new Error('Missing authentication. Please login.');
    }

    const response = await fetch(`/api/history/${id}`, {
        headers: {
            'Authorization': 'Bearer ' + token,
            'X-User-Id': userId
        }
    });

    if (!response.ok) {
        if (response.status === 401) throw new Error('Unauthorized. Please login.');
        const errBody = await response.text().catch(() => '');
        throw new Error(`Failed to fetch history: ${response.status} ${errBody}`);
    }

    return await response.json();
}

function normalizeStatus(name) {
    if (!name) return "";
    return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function isStatusName(name, target) {
    const normalizedName = normalizeStatus(name);
    const normalizedTarget = normalizeStatus(target);
    
    if (normalizedName === normalizedTarget) return true;
    
    // Status Aliases
    if (normalizedTarget === normalizeStatus('En Progreso')) {
        return normalizedName === normalizeStatus('In Progress');
    }
    if (normalizedTarget === normalizeStatus('En Produccion')) {
        return normalizedName === normalizeStatus('Hecho') || normalizedName === normalizeStatus('Done') || normalizedName === normalizeStatus('Listo para Prod');
    }
    if (normalizedTarget === normalizeStatus('Enviado a QA')) {
        return normalizedName === normalizeStatus('QA') || normalizedName === normalizeStatus('En QA') || normalizedName === normalizeStatus('Testing');
    }
    
    return false;
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `< 1m`;
}

function calculateStoryMetrics(story, history) {
    const creation = new Date(story.created_date);
    const sortedHistory = [...history].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    let leadTime = null; // time to production
    let processTime = 0; // computed as inProgressTime + qaTime + extraTime
    let inProgressTime = 0; // tiempo en progreso (accumulated in En Progreso)
    let qaTime = 0; // tiempo en QA (accumulated across QA statuses)
    let extraTime = 0; // time in EXTRA_PROCESS_STATUSES

    let lastInProgressStart = null;
    let lastQaStart = null;
    let lastExtraStart = null;

    sortedHistory.forEach(entry => {
        const entryDate = new Date(entry.created_at);
        if (entry.values_diff && entry.values_diff.status) {
            const statusTo = entry.values_diff.status[1];
            const statusFrom = entry.values_diff.status[0];

            // Lead Time (to Production)
            if (isStatusName(statusTo, 'En Produccion') && !leadTime) {
                leadTime = entryDate - creation;
            }

            // In-Progress Time (En Progreso)
            if (statusMatchesAny(statusTo, IN_PROGRESS_STATUSES)) {
                lastInProgressStart = entryDate;
            } else if (statusMatchesAny(statusFrom, IN_PROGRESS_STATUSES) && lastInProgressStart) {
                inProgressTime += (entryDate - lastInProgressStart);
                lastInProgressStart = null;
            }

            // QA Time (any status in QA_STATUSES)
            if (statusMatchesAny(statusTo, QA_STATUSES)) {
                lastQaStart = entryDate;
            } else if (statusMatchesAny(statusFrom, QA_STATUSES) && lastQaStart) {
                qaTime += (entryDate - lastQaStart);
                lastQaStart = null;
            }

            // Extra Process Time (Pruebas de Usuario, Espera Usuario)
            if (statusMatchesAny(statusTo, EXTRA_PROCESS_STATUSES)) {
                lastExtraStart = entryDate;
            } else if (statusMatchesAny(statusFrom, EXTRA_PROCESS_STATUSES) && lastExtraStart) {
                extraTime += (entryDate - lastExtraStart);
                lastExtraStart = null;
            }
        }
    });

    // Process time is defined as In-Progress + QA + Extra process statuses
    processTime = inProgressTime + qaTime + extraTime;

    return {
        leadTime,
        processTime,
        inProgressTime,
        qaTime,
        extraTime,
        lastInProgressStart,
        lastQaStart,
        lastExtraStart
    };
}


const urlParams = new URLSearchParams(window.location.search);
const projectName = urlParams.get('project');
const projectId = urlParams.get('id');

// Ensure user is authenticated (token present in sessionStorage)
if (!sessionStorage.getItem('auth_token') || !sessionStorage.getItem('user_id')) {
    window.location.href = 'settings.html';
}

if (!projectName) {
    window.location.href = '/';
}

// DOM Elements
const projectNameDisplay = document.getElementById('projectNameDisplay');
const backBtn = document.getElementById('backBtn');
const listView = document.getElementById('listView');
const historyView = document.getElementById('historyView');
const stats = document.getElementById('stats');
const historyBody = document.getElementById('historyBody');
const historyStoryRef = document.getElementById('historyStoryRef');
const historyStorySubject = document.getElementById('historyStorySubject');
const logo = document.getElementById('logo');
const totalTimeValue = document.getElementById('totalTimeValue');
const timeInProgressValue = document.getElementById('timeInProgressValue');
const historyMetrics = document.getElementById('historyMetrics');

// Global (Project) Metrics Elements
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const calculateBtn = document.getElementById('calculateBtn');
const projectMetricsResults = document.getElementById('projectMetricsResults');
const metricsLoading = document.getElementById('metricsLoading');
const projectLeadTime = document.getElementById('projectLeadTime');
const projectCycleTime = document.getElementById('projectCycleTime');
const projectWIP = document.getElementById('projectWIP');
const projectThroughput = document.getElementById('projectThroughput');

let currentData = [];
let projectStories = [];

projectNameDisplay.textContent = projectName;

// Initialize dates
// Initialize dates - showing last 30 days by default
const today = new Date();
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(today.getDate() - 30);
startDateInput.value = thirtyDaysAgo.toISOString().split('T')[0];
endDateInput.value = today.toISOString().split('T')[0];

async function init() {
    listView.innerHTML = '<div class="empty-state">Sincronizando historias del proyecto con Taiga... (esto puede tardar unos segundos)</div>';
    
    try {
        // Trigger specific project refresh
        if (projectId) {
            console.log(`[DEBUG] Refreshing specific project ${projectId}...`);
            const refreshRes = await fetch(`/api/refresh?project=${projectId}`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + sessionStorage.getItem('auth_token'),
                    'X-User-Id': sessionStorage.getItem('user_id')
                }
            });
            if (!refreshRes.ok) {
                console.warn('Project refresh failed, loading existing data...');
            }
        }

        currentData = await fetchData();
        projectStories = currentData.filter(s => String(s.project) === String(projectName));
        stats.textContent = projectStories.length + ' Historias de Usuario';

        if (projectStories.length === 0) {
            listView.innerHTML = `<div class="empty-state"> No se encontraron Historias de Usuario para el proyecto "${projectName}". Puede que aun se esten procesando o que el ID sea incorrecto.</div>`;
            return;
        }

        // Initialize active filters from inputs
        activeFilters.startDate = startDateInput.value;
        activeFilters.endDate = endDateInput.value;

        renderStories();
    } catch (err) {
        console.error('Error al cargar datos del proyecto', err);
        listView.innerHTML = `<div class="empty-state">Error al cargar datos del proyecto: ${err.message}</div>`;
    }
}

let metricCache = new Map();
let activeFilters = {
    title: '',
    assigned: '',
    tag: '',
    sprint: '',
    startDate: '',
    endDate: ''
};

function getFilteredStories() {
    const start = activeFilters.startDate ? new Date(activeFilters.startDate) : null;
    const end = activeFilters.endDate ? new Date(activeFilters.endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    const filtered = projectStories.filter(story => {
        // Date Filter
        const created = new Date(story.created_date);
        let excludeReason = null;

        // Normalize comparison by checking if created is on or after start, and on or BEFORE end
        if (start) {
            const startCheck = new Date(start);
            startCheck.setHours(0, 0, 0, 0);
            if (created < startCheck) excludeReason = 'date_too_early';
        }
        if (end) {
            const endCheck = new Date(end);
            endCheck.setHours(23, 59, 59, 999);
            if (created > endCheck) excludeReason = 'date_too_late';
        }

        // Text Filters
        const matchesTitle = story.subject.toLowerCase().includes(activeFilters.title.toLowerCase());
        const assignedTo = (story.assigned_to_extra_info && story.assigned_to_extra_info.full_name) ||
            (story.assigned_to_extra && story.assigned_to_extra.full_name) ||
            (story.assigned_to && story.assigned_to.full_name) ||
            story.assigned_to_name ||
            'No asignada';
        const matchesAssigned = assignedTo.toLowerCase().includes(activeFilters.assigned.toLowerCase());

        const tagsString = (Array.isArray(story.tags) ? story.tags.map(t => Array.isArray(t) ? t[0] : (typeof t === 'string' ? t.split(',')[0] : String(t))) : []).join(' ');
        const matchesTag = tagsString.toLowerCase().includes(activeFilters.tag.toLowerCase());

        const sprintName = story.sprint_name || 'Sin Sprint';
        const matchesSprint = sprintName.toLowerCase().includes(activeFilters.sprint.toLowerCase());

        const isMatch = matchesTitle && matchesAssigned && matchesTag && matchesSprint;
        return !excludeReason && isMatch;
    });
    return filtered;
}

function updateGlobalMetrics(filteredStories) {
    let totalLeadTime = 0;
    let leadTimeCount = 0;
    let totalCycleTime = 0;
    let cycleTimeCount = 0;
    let throughputCount = 0;
    let wipCount = 0;
    const wipIds = [];
    const throughputIds = [];

    filteredStories.forEach(story => {
        const metrics = metricCache.get(story.id);
        const statusName = story.status_name ||
            (story.status_extra_info && story.status_extra_info.name) ||
            (story.status_extra && story.status_extra.name) ||
            (story.status && story.status.name) || "";

        if (isStatusName(statusName, 'En Produccion')) {
            throughputCount++;
            throughputIds.push(story.id);
        }
        if (isStatusName(statusName, 'En Progreso')) {
            wipCount++;
            wipIds.push(story.id);
        }

        if (metrics) {
            if (metrics.leadTime && isStatusName(statusName, 'En Produccion')) {
                totalLeadTime += metrics.leadTime;
                leadTimeCount++;
            }
            const currentCycle = (metrics.inProgressTime || 0) + (metrics.lastInProgressStart ? (new Date() - metrics.lastInProgressStart) : 0);
            if (currentCycle > 0) {
                totalCycleTime += currentCycle;
                cycleTimeCount++;
            }
        }
    });

    projectLeadTime.textContent = leadTimeCount > 0 ? formatDuration(totalLeadTime / leadTimeCount) : '--';
    projectCycleTime.textContent = cycleTimeCount > 0 ? formatDuration(totalCycleTime / cycleTimeCount) : '--';
    projectThroughput.textContent = throughputCount;
    projectWIP.textContent = wipCount;
}

function renderStories() {
    const filteredStories = getFilteredStories();
    updateGlobalMetrics(filteredStories);

    if (projectStories.length === 0) {
        listView.innerHTML = `<div class="empty-state"> No hay Historias de Usuario en este proyecto ${projectName}.</div>`;
        return;
    }

    if (filteredStories.length === 0) {
        listView.innerHTML = `<div class="empty-state"> No hay historias que coincidan con los filtros seleccionados.</div>`;
        return;
    }

    listView.innerHTML = `
        <table class="stories-table">
            <thead>
                <tr>
                    <th class="col-id">ID</th>
                    <th class="col-title">
                        <div class="header-filter">
                            <span>Titulo</span>
                            <input type="text" id="titleFilter" class="column-filter" placeholder="Filtrar por titulo..." value="${activeFilters.title}">
                        </div>
                    </th>
                    <th class="col-tags">
                        <div class="header-filter">
                            <span>TAGS</span>
                            <input type="text" id="tagFilter" class="column-filter" placeholder="Filtrar por tag..." value="${activeFilters.tag}">
                        </div>
                    </th>
                    <th class="col-assigned">
                        <div class="header-filter">
                            <span>Asignado a</span>
                            <input type="text" id="assignedFilter" class="column-filter" placeholder="Filtrar por asignado..." value="${activeFilters.assigned}">
                        </div>
                    </th>
                    <th class="col-sprint">
                        <div class="header-filter">
                            <span>Sprint</span>
                            <input type="text" id="sprintFilter" class="column-filter" placeholder="Filtrar por sprint..." value="${activeFilters.sprint}">
                        </div>
                    </th>
                    <th class="col-points">Puntos</th>
                    <th class="col-status">Status</th>
                    <th class="col-metric">Tiempo de Proceso</th>
                    <th class="col-metric">Tiempo en Progreso</th>
                    <th class="col-metric">Tiempo en QA</th>
                </tr>
            </thead>
            <tbody id="storiesBody">
                ${filteredStories.map((story, idx) => {
        const assignedTo = story.assigned_to_name ||
            (story.assigned_to_extra_info && story.assigned_to_extra_info.full_name) ||
            (story.assigned_to_extra && story.assigned_to_extra.full_name) ||
            (story.assigned_to && story.assigned_to.full_name) ||
            'No asignada';

        const statusName = story.status_name ||
            (story.status_extra_info && story.status_extra_info.name) ||
            (story.status_extra && story.status_extra.name) ||
            (story.status && story.status.name) ||
            'Unknown';

        const metrics = metricCache.get(story.id);
        const tags = Array.isArray(story.tags) ? story.tags : [];

        return `
                        <tr class="story-row" data-id="${story.id}" data-ref="${story.ref}" data-subject="${story.subject.replace(/"/g, '&quot;')}" data-created="${story.created_date}">
                            <td><span class="story-ref">#${story.ref}</span></td>
                            <td><div class="story-subject">${story.subject}</div></td>
                            <td>
                                <div class="tags-container">
                                    ${tags.map(tag => {
                                        let name, color;
                                        if (Array.isArray(tag)) {
                                            [name, color] = tag;
                                        } else if (typeof tag === 'string') {
                                            [name, color] = tag.split(',');
                                        } else {
                                            name = String(tag);
                                        }
                                        const style = color ? `style="background-color: ${color}; color: white; border: none; text-shadow: 0 1px 2px rgba(0,0,0,0.2);"` : '';
                                        return `<span class="tag-badge" ${style}>${name}</span>`;
                                    }).join('')}
                                </div>
                            </td>
                            <td><span class="tag">${assignedTo}</span></td>
                            <td><span class="tag" style="background: rgba(255, 255, 255, 0.05); color: var(--text-secondary); border-color: var(--glass-border); text-transform: none;">${story.sprint_name || 'Sin Sprint'}</span></td>
                            <td style="text-align: center;">${story.total_points || 0}</td>
                            <td><span class="tag status-tag">${statusName}</span></td>
                            <td id="process-time-${story.id}">
                                ${metrics ? formatDuration(
                                    (metrics.inProgressTime || 0) + (metrics.lastInProgressStart ? (new Date() - metrics.lastInProgressStart) : 0)
                                    + (metrics.qaTime || 0) + (metrics.lastQaStart ? (new Date() - metrics.lastQaStart) : 0)
                                    + (metrics.extraTime || 0) + (metrics.lastExtraStart ? (new Date() - metrics.lastExtraStart) : 0)
                                ) : '<div class="loading-cell"><div class="loader"></div><span>Obteniendo...</span></div>'}
                            </td>
                            <td id="in-progress-${story.id}">
                                ${metrics ? formatDuration((metrics.inProgressTime || 0) + (metrics.lastInProgressStart ? (new Date() - metrics.lastInProgressStart) : 0)) : '<div class="loading-cell"><div class="loader"></div><span>Obteniendo...</span></div>'}
                            </td>
                            <td id="qa-time-${story.id}">
                                ${metrics ? formatDuration((metrics.qaTime || 0) + (metrics.lastQaStart ? (new Date() - metrics.lastQaStart) : 0)) : '<div class="loading-cell"><div class="loader"></div><span>Obteniendo...</span></div>'}
                            </td>
                        </tr>
                    `;
    }).join('')}
            </tbody>
        </table>
    `;

    // Re-attach event listeners for filters
    document.getElementById('titleFilter').addEventListener('input', (e) => {
        activeFilters.title = e.target.value;
        renderStories();
    });
    document.getElementById('assignedFilter').addEventListener('input', (e) => {
        activeFilters.assigned = e.target.value;
        renderStories();
    });
    document.getElementById('tagFilter').addEventListener('input', (e) => {
        activeFilters.tag = e.target.value;
        renderStories();
    });
    document.getElementById('sprintFilter').addEventListener('input', (e) => {
        activeFilters.sprint = e.target.value;
        renderStories();
    });

    // Re-attach click listeners for rows (history view)
    document.querySelectorAll('.story-row').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT') return;
            viewHistory(
                row.getAttribute('data-id'),
                row.getAttribute('data-ref'),
                row.getAttribute('data-subject'),
                row.getAttribute('data-created')
            );
        });
    });

    // Start background fetching for metrics if not cached
    filteredStories.forEach(story => {
        if (!metricCache.has(story.id)) {
            fetchRowMetrics(story);
        }
    });
}

async function fetchRowMetrics(story) {
    try {
        const history = await fetchHistory(story.id);
        const metrics = calculateStoryMetrics({ created_date: story.created_date }, history);
        metricCache.set(story.id, metrics);

        // Update the cells directly if they exist in the DOM
        const processCell = document.getElementById(`process-time-${story.id}`);
        const progressCell = document.getElementById(`in-progress-${story.id}`);
        const qaCell = document.getElementById(`qa-time-${story.id}`);

        if (processCell) {
            const currentProcess = (metrics.inProgressTime || 0) + (metrics.lastInProgressStart ? (new Date() - metrics.lastInProgressStart) : 0)
                + (metrics.qaTime || 0) + (metrics.lastQaStart ? (new Date() - metrics.lastQaStart) : 0)
                + (metrics.extraTime || 0) + (metrics.lastExtraStart ? (new Date() - metrics.lastExtraStart) : 0);
            processCell.textContent = currentProcess > 0 ? formatDuration(currentProcess) : 'N/A';
        }
        if (progressCell) {
            const currentCycle = (metrics.inProgressTime || 0) + (metrics.lastInProgressStart ? (new Date() - metrics.lastInProgressStart) : 0);
            progressCell.textContent = currentCycle > 0 ? formatDuration(currentCycle) : '0h';
        }
        if (qaCell) {
            const currentQa = (metrics.qaTime || 0) + (metrics.lastQaStart ? (new Date() - metrics.lastQaStart) : 0);
            qaCell.textContent = currentQa > 0 ? formatDuration(currentQa) : '0h';
        }

        // Update global metrics since we have new data
        updateGlobalMetrics(getFilteredStories());
    } catch (err) {
        console.error(`Error al obtener metricas de la historia ${story.id}`, err);
        const processCell = document.getElementById(`process-time-${story.id}`);
        const progressCell = document.getElementById(`in-progress-${story.id}`);
        const qaCell = document.getElementById(`qa-time-${story.id}`);
        if (err && (err.message && (err.message.includes('Unauthorized') || err.message.includes('Missing authentication')))) {
            // Redirect user to settings to re-authenticate
            window.location.href = 'settings.html';
            return;
        }
        if (processCell) processCell.textContent = 'Error';
        if (progressCell) progressCell.textContent = 'Error';
        if (qaCell) qaCell.textContent = 'Error';
    }
}

async function viewHistory(id, ref, subject, createdDate) {
    historyView.classList.remove('hidden');
    historyStoryRef.textContent = '#' + ref;
    historyStorySubject.textContent = subject;
    historyBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 3rem;"><div class="loader"></div><br><br>Cargando historial...</td></tr>';
    historyMetrics.classList.add('hidden');

    try {
        const history = await fetchHistory(id);
        const metrics = calculateStoryMetrics({ created_date: createdDate }, history);

        // Show Process, In-Progress and QA times in the history panel
        const currentProcess = (metrics.inProgressTime || 0) + (metrics.lastInProgressStart ? (new Date() - metrics.lastInProgressStart) : 0)
            + (metrics.qaTime || 0) + (metrics.lastQaStart ? (new Date() - metrics.lastQaStart) : 0)
            + (metrics.extraTime || 0) + (metrics.lastExtraStart ? (new Date() - metrics.lastExtraStart) : 0);
        totalTimeValue.textContent = currentProcess > 0 ? formatDuration(currentProcess) : 'N/A';
        const currentCycle = (metrics.inProgressTime || 0) + (metrics.lastInProgressStart ? (new Date() - metrics.lastInProgressStart) : 0);
        timeInProgressValue.textContent = currentCycle > 0 ? formatDuration(currentCycle) : '0h';
        historyMetrics.classList.remove('hidden');

        const rows = history.filter(entry => entry.values_diff).map(entry => {
            const diffs = [];
            Object.keys(entry.values_diff).forEach(key => {
                const diff = entry.values_diff[key];
                diffs.push(`
                    <tr>
                        <td><span class="tag">${key}</span></td>
                        <td class="diff-from">${Array.isArray(diff) ? (diff[0] || '-') : '-'}</td>
                        <td class="diff-to">${Array.isArray(diff) ? (diff[1] || diff) : diff}</td>
                        <td>${new Date(entry.created_at).toLocaleString()}</td>
                    </tr>
                `);
            });
            return diffs.join('');
        });

        historyBody.innerHTML = rows.length > 0 ? rows.join('') : '<tr><td colspan="4" style="text-align:center; padding: 3rem; color: var(--text-secondary);">No se encontro historial relevante.</td></tr>';
        historyView.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
        console.error('Error loading history', err);
        if (err && (err.message && (err.message.includes('Unauthorized') || err.message.includes('Missing authentication')))) {
            // Redirect to settings for re-authentication
            window.location.href = 'settings.html';
            return;
        }
        historyBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 3rem; color: var(--danger);">Error al cargar historial: ${err.message || 'Unknown'}</td></tr>`;
    }
}

// Event Listeners
backBtn.addEventListener('click', () => window.location.href = '/');
logo.addEventListener('click', () => window.location.href = '/');

startDateInput.addEventListener('change', (e) => {
    activeFilters.startDate = e.target.value;
    renderStories();
});

endDateInput.addEventListener('change', (e) => {
    activeFilters.endDate = e.target.value;
    renderStories();
});

calculateBtn.addEventListener('click', async () => {
    // Show loading state
    calculateBtn.disabled = true;
    metricsLoading.classList.remove('hidden');
    projectMetricsResults.style.opacity = '0.5';

    try {
        // Trigger data refresh in the backend for this specific project
        const url = projectId ? `/api/refresh?project=${projectId}` : '/api/refresh';
        await fetch(url, { method: 'POST', headers: {
            'Authorization': 'Bearer ' + sessionStorage.getItem('auth_token'),
            'X-User-Id': sessionStorage.getItem('user_id')
        }});
        
        // Re-fetch all data to get the new stories from the backend
        currentData = await fetchData();
        projectStories = currentData.filter(s => String(s.project) === String(projectName));
        
        // Update the stats count
        stats.textContent = projectStories.length + ' Historias de Usuario';

        // Apply filters and render
        activeFilters.startDate = startDateInput.value;
        activeFilters.endDate = endDateInput.value;
        renderStories();
    } catch (err) {
        console.error('Error al actualizar datos:', err);
    } finally {
        calculateBtn.disabled = false;
        metricsLoading.classList.add('hidden');
        projectMetricsResults.style.opacity = '1';
    }
});

init();
