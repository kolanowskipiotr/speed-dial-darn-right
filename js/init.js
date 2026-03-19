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

const _hdr = document.querySelector('header');
const _updateHeaderHeight = () =>
    document.documentElement.style.setProperty('--header-height', _hdr.offsetHeight + 'px');
new ResizeObserver(_updateHeaderHeight).observe(_hdr);
_updateHeaderHeight();
