// ─── INIT ───────────────────────────────────────────────────────

document.addEventListener('dragend', () => {
    clearDropIndicators();
    if (typeof _clearTodoDragIndicators !== 'undefined') _clearTodoDragIndicators();
});

// Escape key: priority chain (highest to lowest)
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // 1. Exit notes full-screen mode
    if (typeof notesFullScreen !== 'undefined' && notesFullScreen) {
        toggleNotesFullScreen();
        e.stopPropagation();
        return;
    }
    // 2. Exit todo full-screen mode
    if (typeof todoFullScreen !== 'undefined' && todoFullScreen) {
        exitTodoFullScreen();
        e.stopPropagation();
        return;
    }
    // 3. Close item editor if open
    if (typeof editingTodoItemId !== 'undefined' && editingTodoItemId) {
        closeItemEditor();
        e.stopPropagation();
        return;
    }
    // 4. Collapse inline-expanded item
    if (typeof expandedItemId !== 'undefined' && expandedItemId) {
        expandedItemId = null;
        const todoCol = document.querySelector('.home-col-todo');
        if (todoCol) renderTodoPanel(todoCol);
        e.stopPropagation();
        return;
    }
    // 5. Close any open modal
    document.querySelectorAll('.modal-backdrop.open').forEach(bd => bd.classList.remove('open'));
});

loadTheme();
renderThemeSelector();
loadData();
initEmojiPickers();
render();
updateClock();
updateDialCount();
setInterval(updateClock, 1000);
initLogoAnimation();
initSizePresets();

setTimeout(initSearch, 100);

// Initialize Sync Config
initSyncConfig();

// Initialize Weather
if (typeof initWeather === 'function') {
    initWeather();
}


const _hdr = document.querySelector('header');
const _updateHeaderHeight = () =>
    document.documentElement.style.setProperty('--header-height', _hdr.offsetHeight + 'px');
new ResizeObserver(_updateHeaderHeight).observe(_hdr);
_updateHeaderHeight();
