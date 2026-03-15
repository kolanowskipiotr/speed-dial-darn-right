// ─── INIT ───────────────────────────────────────────────────────
document.addEventListener('dragend', () => {
    clearDropIndicators();
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
initSearch();
