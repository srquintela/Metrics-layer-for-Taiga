const urlParams = new URLSearchParams(window.location.search);
const projectName = urlParams.get('project');
const projectId = urlParams.get('id');

if (!projectName) {
    window.location.href = '/';
}

const projectNameDisplay = document.getElementById('projectNameDisplay');
const sprintSelect = document.getElementById('sprintSelect');
const workdaysInput = document.getElementById('workdaysInput');
const refreshScrumBtn = document.getElementById('refreshScrumBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const backBtn = document.getElementById('backBtn');
const logo = document.getElementById('logo');

projectNameDisplay.textContent = projectName;

let allData = [];
let projectStories = [];
let chartInstances = {
    burndown: null,
    progress: null,
    tasks: null
};

// Colors for charts
const COLORS = [
    '#38bdf8', '#818cf8', '#fb7185', '#34d399', '#fbbf24', '#a78bfa', '#94a3b8'
];

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

    // Equivalence for "En Produccion" (Done) status
    if (normalizedTarget === normalizeStatus('En Produccion')) {
        const equivalents = [
            'en produccion', 'completado', 'hecho', 'done',
            'listo para prod', 'finished', 'concluido'
        ].map(normalizeStatus);
        return equivalents.includes(normalizedName);
    }
    return false;
}

function getWorkdays(start, end) {
    const days = [];
    let current = new Date(start + 'T00:00:00');
    const last = new Date(end + 'T00:00:00');

    while (current <= last) {
        const dayOfWeek = current.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip Sun (0) and Sat (6)
            days.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
    }
    return days;
}

async function init() {
    loadingOverlay.classList.remove('hidden');
    const loadingText = loadingOverlay.querySelector('span');
    const originalText = loadingText.textContent;
    loadingText.textContent = 'Sincronizando datos del proyecto con Taiga...';

    try {
        // Trigger specific project refresh
        if (projectId) {
            console.log(`[DEBUG] Refreshing specific project ${projectId}...`);
            const refreshRes = await fetch(`/api/refresh?project=${projectId}`, { method: 'POST' });
            if (!refreshRes.ok) {
                console.warn('Project refresh failed, loading existing data...');
            }
        }

        loadingText.textContent = originalText;
        allData = await fetchData();
        projectStories = allData.filter(s => String(s.project) === projectName);

        // Populate Sprints
        const sprints = [...new Set(projectStories.map(s => s.sprint_name))].filter(s => s && s !== 'Sin Sprint');

        if (sprints.length > 0) {
            sprintSelect.innerHTML = sprints.map(s => `<option value="${s}">${s}</option>`).join('');
            updateDashboard();
        } else {
            sprintSelect.innerHTML = '<option value="">No hay sprints en este proyecto</option>';
        }
    } catch (err) {
        console.error('Error initializing Scrum view:', err);
    } finally {
        loadingOverlay.classList.add('hidden');
        loadingText.textContent = originalText;
    }
}

async function updateDashboard() {
    const selectedSprint = sprintSelect.value;

    if (!selectedSprint) return;

    const sprintStories = projectStories.filter(s => s.sprint_name === selectedSprint);
    if (sprintStories.length === 0) return;

    const sprintStart = sprintStories[0].sprint_start;
    const sprintEnd = sprintStories[0].sprint_end;

    loadingOverlay.classList.remove('hidden');

    // 1. Burndown Chart Logic
    const historyData = await renderBurndown(sprintStories, sprintStart, sprintEnd);

    // 2. Story Progress Logic
    renderProgress(sprintStories);

    // 3. Team Member Performance Logic
    renderMemberPerformance(sprintStories);

    // 4. Velocity Tracking Logic
    if (historyData && historyData.completions) {
        renderVelocityTracking(historyData.completions, sprintStart, sprintEnd);
    }

    loadingOverlay.classList.add('hidden');
}

async function renderBurndown(stories, start, end) {
    if (!start || !end) {
        console.warn('Faltan fechas del sprint para el Burndown');
        return;
    }
    // Use number of tasks as the unit for the burndown
    const totalTasks = stories.reduce((sum, s) => sum + (s.tasks_total_count || (s.tasks && s.tasks.length) || 0), 0);
    const workdays = getWorkdays(start, end);
    const daysCount = workdays.length;

    // Use finished_date on tasks (provided by backend) to build completions timeline
    const completions = [];
    stories.forEach(story => {
        (story.tasks || []).forEach(t => {
            const fd = t.finished_date || t.finishedDate || t.finished || null;
            if (fd) {
                try {
                    completions.push({ date: new Date(fd) });
                } catch (e) {
                    // ignore unparsable dates
                }
            }
        });
    });

    // Build X-Axis Labels (Dates)
    const labels = workdays.map(d => d.toISOString().split('T')[0]);
    // Prepend day 0 (start of first day)
    const chartLabels = ['Inicio', ...labels];

    // Ideal line based on total tasks
    const ideal = chartLabels.map((_, i) => {
        if (i === 0) return totalTasks;
        if (daysCount === 0) return 0;
        return Math.max(0, Math.round(totalTasks - (i * (totalTasks / daysCount))));
    });

    // Actual line
    const actual = [totalTasks];

    workdays.forEach(day => {
        // Find stories completed on or before this day's end (23:59:59)
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 999);

        // Count tasks completed by this day
        const finishedByToday = completions.filter(c => c.date <= dayEnd).length;
        actual.push(Math.max(0, totalTasks - finishedByToday));
    });

    const ctx = document.getElementById('burndownChart').getContext('2d');
    if (chartInstances.burndown) chartInstances.burndown.destroy();

    chartInstances.burndown = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Ideal (Puntos)',
                data: ideal,
                borderColor: 'rgba(255, 255, 255, 0.2)',
                borderDash: [5, 5],
                fill: false,
                tension: 0,
                pointRadius: 0
            }, {
                label: 'Restante (Actual)',
                data: actual,
                borderColor: COLORS[0],
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: COLORS[0]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { labels: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary').trim(), font: { family: 'Outfit' } } },
                tooltip: { backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg-color').trim(), titleColor: getComputedStyle(document.body).getPropertyValue('--text-primary').trim(), bodyColor: getComputedStyle(document.body).getPropertyValue('--text-primary').trim() }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: getComputedStyle(document.body).getPropertyValue('--glass-border').trim() }, ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary').trim(), font: { family: 'Outfit' } } },
                x: { grid: { display: false }, ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary').trim(), font: { family: 'Outfit' }, maxRotation: 45, minRotation: 45 } }
            }
        }
    });

    return { completions };
}

function renderProgress(stories) {
    const statusStats = {};
    stories.forEach(s => {
        const status = s.status_name || 'Desconocido';
        statusStats[status] = (statusStats[status] || 0) + 1;
    });

    const labels = Object.keys(statusStats);
    const data = Object.values(statusStats);

    const ctx = document.getElementById('progressChart').getContext('2d');
    if (chartInstances.progress) chartInstances.progress.destroy();

    chartInstances.progress = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: COLORS,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom', labels: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary').trim(), padding: 20, font: { family: 'Outfit' } } }
            }
        }
    });
}

function renderMemberPerformance(stories) {
    const memberStats = {};
    stories.forEach(s => {
        (s.tasks || []).forEach(t => {
            const member = t.assigned_to_name || 'Sin Asignar';
            memberStats[member] = (memberStats[member] || 0) + 1;
        });
    });

    const labels = Object.keys(memberStats).sort((a, b) => memberStats[b] - memberStats[a]);
    const data = labels.map(l => memberStats[l]);

    const ctx = document.getElementById('teamChart').getContext('2d');
    if (chartInstances.team) chartInstances.team.destroy();

    chartInstances.team = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tareas por Dev',
                data: data,
                backgroundColor: COLORS.slice(0, labels.length),
                borderRadius: 5
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { beginAtZero: true, grid: { color: getComputedStyle(document.body).getPropertyValue('--glass-border').trim() }, ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary').trim(), stepSize: 1, font: { family: 'Outfit' } } },
                y: { grid: { display: false }, ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary').trim(), font: { family: 'Outfit' } } }
            }
        }
    });
}

function renderVelocityTracking(completions, start, end) {
    const workdays = getWorkdays(start, end);
    const labels = workdays.map(d => d.toISOString().split('T')[0]);

    const dailyVelocity = labels.map(labelDate => {
        const dayStart = new Date(labelDate + 'T00:00:00');
        const dayEnd = new Date(labelDate + 'T23:59:59');

        return completions.filter(c => c.date >= dayStart && c.date <= dayEnd).length;
    });

    const ctx = document.getElementById('velocityChart').getContext('2d');
    if (chartInstances.velocity) chartInstances.velocity.destroy();

    chartInstances.velocity = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Velocidad de Entrega',
                data: dailyVelocity,
                borderColor: COLORS[2],
                backgroundColor: 'rgba(251, 113, 133, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: COLORS[2]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary').trim(), font: { family: 'Outfit' } } }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: getComputedStyle(document.body).getPropertyValue('--glass-border').trim() }, ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary').trim(), stepSize: 1, font: { family: 'Outfit' } } },
                x: { grid: { display: false }, ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary').trim(), font: { family: 'Outfit' }, maxRotation: 45, minRotation: 45 } }
            }
        }
    });
}

// Event Listeners
backBtn.addEventListener('click', () => window.history.back());
logo.addEventListener('click', () => window.location.href = '/');
refreshScrumBtn.addEventListener('click', updateDashboard);
sprintSelect.addEventListener('change', updateDashboard);

init();
