// ─── THEMES ─────────────────────────────────────────────────────
const THEMES = [
    { id: 'dark-yellow',  label: 'Dark Yellow',  bg: '#0f1117', accent: '#f0a500' },
    { id: 'dark-blue',    label: 'Dark Blue',    bg: '#0d1117', accent: '#4da6ff' },
    { id: 'dark-purple',  label: 'Dark Purple',  bg: '#0f0d17', accent: '#a855f7' },
    { id: 'dark-teal',    label: 'Dark Teal',    bg: '#0d1714', accent: '#2dd4bf' },
    { id: 'light-blue',   label: 'Light Blue',   bg: '#f4f6fb', accent: '#2563eb' },
    { id: 'light-warm',   label: 'Light Warm',   bg: '#faf8f4', accent: '#d97706' },
];

function applyTheme(themeId) {
    document.body.dataset.theme = themeId === 'dark-yellow' ? '' : themeId;
    localStorage.setItem('speedDial_theme', themeId);
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === themeId);
    });
    if (window.NotesCM) NotesCM.setTheme(!themeId.startsWith('light'));
}

function loadTheme() {
    applyTheme(localStorage.getItem('speedDial_theme') || 'dark-yellow');
}

function renderThemeSelector() {
    const el = document.getElementById('themeSelector');
    if (!el) return;
    el.innerHTML = '';
    THEMES.forEach(theme => {
        const btn = document.createElement('button');
        btn.className = 'theme-btn' + (
            (localStorage.getItem('speedDial_theme') || 'dark-yellow') === theme.id ? ' active' : ''
        );
        btn.dataset.theme = theme.id;
        btn.title = theme.label;
        // Diagonal split: top-left = bg, bottom-right = accent
        btn.style.background = `linear-gradient(135deg, ${theme.bg} 50%, ${theme.accent} 50%)`;
        btn.onclick = () => applyTheme(theme.id);
        el.appendChild(btn);
    });
}
