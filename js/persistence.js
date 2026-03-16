// ─── DATA PERSISTENCE ──────────────────────────────────────────
function loadData() {
    try {
        const raw = localStorage.getItem('speedDial_v2');
        if (raw) data = JSON.parse(raw);
    } catch(e) { data = { tabs: [] }; }

    // Migrate old format: { groups: [...] } → { tabs: [{ id, name, groups }] }
    if (data.groups && !data.tabs) {
        data = { tabs: [{ id: uid(), name: 'Home', groups: data.groups }] };
        saveData();
    }
    if (!data.tabs) data = { tabs: [] };
    if (!data.tabs.length) {
        data.tabs.push({ id: uid(), name: 'Start', emoji: '🏠', isHome: true, groups: [] });
        saveData();
    }
    // Ensure one tab is marked as the home tab — prepend a new one if missing
    if (!data.tabs.some(t => t.isHome)) {
        data.tabs.unshift({ id: uid(), name: 'Start', emoji: '🏠', isHome: true, groups: [] });
        saveData();
    }
    activeTabId = data.tabs[0].id;
}

function getActiveTab() {
    return data.tabs.find(t => t.id === activeTabId) || data.tabs[0];
}

function saveData() {
    localStorage.setItem('speedDial_v2', JSON.stringify(data));
}
