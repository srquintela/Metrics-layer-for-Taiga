
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
        return normalizedName === normalizeStatus('Hecho') || normalizedName === normalizeStatus('Done');
    }
    
    return false;
}

const tests = [
    { name: 'En progreso', target: 'En Progreso', expected: true },
    { name: 'In Progress', target: 'En Progreso', expected: true },
    { name: 'En produccion', target: 'En Produccion', expected: true },
    { name: 'Done', target: 'En Produccion', expected: true },
    { name: 'Hecho', target: 'En Produccion', expected: true },
    { name: 'Finished', target: 'En Produccion', expected: false },
    { name: 'Backlog', target: 'En Progreso', expected: false },
];

tests.forEach(t => {
    const result = isStatusName(t.name, t.target);
    const pass = result === t.expected;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] "${t.name}" -> "${t.target}" (Expected: ${t.expected}, Got: ${result})`);
});
