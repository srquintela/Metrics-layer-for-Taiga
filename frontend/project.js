async function fetchData() {
    const response = await fetch('/api/data');
    const result = await response.json();
    return result.items || [];
}

async function fetchHistory(id) {
    const response = await fetch(`/api/history/${id}`);
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

    let leadTime = null;
    let cycleTime = 0;
    let qaTime = 0;
    let lastInProgressStart = null;
    let lastQaStart = null;

    sortedHistory.forEach(entry => {
        const entryDate = new Date(entry.created_at);
        if (entry.values_diff && entry.values_diff.status) {
            const statusTo = entry.values_diff.status[1];
            const statusFrom = entry.values_diff.status[0];

            // Lead Time (to Production)
            if (isStatusName(statusTo, 'En Produccion') && !leadTime) {
                leadTime = entryDate - creation;
            }

            // Cycle Time (Progress)
            if (isStatusName(statusTo, 'En Progreso')) {
                lastInProgressStart = entryDate;
            } else if (isStatusName(statusFrom, 'En Progreso') && lastInProgressStart) {
                cycleTime += (entryDate - lastInProgressStart);
                lastInProgressStart = null;
            }

            // QA Time
            if (isStatusName(statusTo, 'Enviado a QA')) {
                lastQaStart = entryDate;
            } else if (isStatusName(statusFrom, 'Enviado a QA') && lastQaStart) {
                qaTime += (entryDate - lastQaStart);
                lastQaStart = null;
            }
        }
    });

    return { leadTime, cycleTime, qaTime, lastInProgressStart, lastQaStart };
}


const urlParams = new URLSearchParams(window.location.search);
const projectName = urlParams.get('project');

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
    try {
        currentData = await fetchData();
        projectStories = currentData.filter(s => String(s.project) === String(projectName));
        stats.textContent = projectStories.length + ' Historias de Usuario';

        // Initialize active filters from inputs
        activeFilters.startDate = startDateInput.value;
        activeFilters.endDate = endDateInput.value;

        renderStories();
    } catch (err) {
        console.error('Error al cargar datos del proyecto', err);
        listView.innerHTML = '<div class="empty-state">Error al cargar datos del proyecto.</div>';
    }
}

let metricCache = new Map();
let activeFilters = {
    title: '',
    assigned: '',
    tag: '',
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

        const isMatch = matchesTitle && matchesAssigned && matchesTag;
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
            const currentCycle = metrics.cycleTime + (metrics.lastInProgressStart ? (new Date() - metrics.lastInProgressStart) : 0);
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
                            <td style="text-align: center;">${story.total_points || 0}</td>
                            <td><span class="tag status-tag">${statusName}</span></td>
                            <td id="process-time-${story.id}">
                                ${metrics ? formatDuration(metrics.leadTime) : '<div class="loading-cell"><div class="loader"></div><span>Obteniendo...</span></div>'}
                            </td>
                            <td id="in-progress-${story.id}">
                                ${metrics ? formatDuration(metrics.cycleTime + (metrics.lastInProgressStart ? (new Date() - metrics.lastInProgressStart) : 0)) : '<div class="loading-cell"><div class="loader"></div><span>Obteniendo...</span></div>'}
                            </td>
                            <td id="qa-time-${story.id}">
                                ${metrics ? formatDuration(metrics.qaTime + (metrics.lastQaStart ? (new Date() - metrics.lastQaStart) : 0)) : '<div class="loading-cell"><div class="loader"></div><span>Obteniendo...</span></div>'}
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
            processCell.textContent = metrics.leadTime ? formatDuration(metrics.leadTime) : 'N/A';
        }
        if (progressCell) {
            const currentCycle = metrics.cycleTime + (metrics.lastInProgressStart ? (new Date() - metrics.lastInProgressStart) : 0);
            progressCell.textContent = currentCycle > 0 ? formatDuration(currentCycle) : '0h';
        }
        if (qaCell) {
            const currentQa = metrics.qaTime + (metrics.lastQaStart ? (new Date() - metrics.lastQaStart) : 0);
            qaCell.textContent = currentQa > 0 ? formatDuration(currentQa) : '0h';
        }

        // Update global metrics since we have new data
        updateGlobalMetrics(getFilteredStories());
    } catch (err) {
        console.error(`Error al obtener metricas de la historia ${story.id}`, err);
        const processCell = document.getElementById(`process-time-${story.id}`);
        const progressCell = document.getElementById(`in-progress-${story.id}`);
        const qaCell = document.getElementById(`qa-time-${story.id}`);
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

        totalTimeValue.textContent = metrics.leadTime ? formatDuration(metrics.leadTime) : 'N/A';
        const currentCycle = metrics.cycleTime + (metrics.lastInProgressStart ? (new Date() - metrics.lastInProgressStart) : 0);
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
        historyBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 3rem; color: var(--danger);">Error al cargar historial.</td></tr>';
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
        // Trigger data refresh in the backend
        await fetch('/api/refresh', { method: 'POST' });
        
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
