// ─── SEARCH ─────────────────────────────────────────────────────
let searchQuery = '';

function initSearch() {
    const input = document.getElementById('searchInput');
    if (!input) return;

    input.addEventListener('input', () => {
        searchQuery = input.value;
        renderSearchResults();
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            clearSearch();
            input.blur();
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusSearchResult(0);
        }
    });

    // Close results when clicking outside the search wrap
    document.addEventListener('click', e => {
        if (!e.target.closest('#headerSearchWrap')) {
            hideSearchResults();
        }
    });
}

function clearSearch() {
    searchQuery = '';
    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    hideSearchResults();
}

function hideSearchResults() {
    const dropdown = document.getElementById('searchDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

function renderSearchResults() {
    const dropdown = document.getElementById('searchDropdown');
    if (!dropdown) return;

    const q = searchQuery.trim().toLowerCase();
    if (!q) {
        dropdown.style.display = 'none';
        return;
    }

    // Collect all matching dials across all tabs
    const results = [];
    data.tabs.forEach(tab => {
        tab.groups.forEach(group => {
            group.dials.forEach(dial => {
                if (dialMatchesSearch(dial, q)) {
                    results.push({ dial, group, tab });
                }
            });
        });
    });

    dropdown.innerHTML = '';

    if (!results.length) {
        const msg = document.createElement('div');
        msg.className = 'search-no-results';
        msg.textContent = 'No dials found';
        dropdown.appendChild(msg);
        dropdown.style.display = 'block';
        return;
    }

    results.forEach(({ dial, group, tab }, i) => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.tabIndex = 0;

        // Icon
        const iconWrap = document.createElement('div');
        iconWrap.className = 'search-result-icon';
        if (dial.iconType === 'none') {
            iconWrap.textContent = ICONS.faviconFallback;
        } else if (dial.iconType === 'emoji' || !dial.iconType) {
            iconWrap.textContent = dial.emoji || ICONS.faviconFallback;
        } else {
            // favicon or custom image
            const img = document.createElement('img');
            img.alt = '';
            img.width = 20;
            img.height = 20;
            img.style.cssText = 'border-radius:3px;object-fit:cover;display:block';
            img.onerror = () => { iconWrap.textContent = dial.emoji || ICONS.faviconFallback; img.remove(); };
            if (dial.icon) {
                img.src = dial.icon;
            } else {
                attachFavicon(img, dial.url, dial.emoji || ICONS.faviconFallback);
            }
            iconWrap.appendChild(img);
        }

        // Text
        const textWrap = document.createElement('div');
        textWrap.className = 'search-result-text';

        const nameEl = document.createElement('div');
        nameEl.className = 'search-result-name';
        nameEl.textContent = dial.name;

        const metaEl = document.createElement('div');
        metaEl.className = 'search-result-meta';
        const tabPrefix = tab.emoji ? tab.emoji + ' ' : '';
        metaEl.textContent = `${tabPrefix}${tab.name} › ${group.name}`;

        textWrap.appendChild(nameEl);
        textWrap.appendChild(metaEl);

        item.appendChild(iconWrap);
        item.appendChild(textWrap);

        item.addEventListener('click', () => jumpToDial(dial, tab));
        item.addEventListener('keydown', e => {
            if (e.key === 'Enter') jumpToDial(dial, tab);
            if (e.key === 'ArrowDown') { e.preventDefault(); focusSearchResult(i + 1); }
            if (e.key === 'ArrowUp') { e.preventDefault(); i > 0 ? focusSearchResult(i - 1) : document.getElementById('searchInput').focus(); }
            if (e.key === 'Escape') { clearSearch(); document.getElementById('searchInput').blur(); }
        });

        dropdown.appendChild(item);
    });

    dropdown.style.display = 'block';
}

function focusSearchResult(index) {
    const items = document.querySelectorAll('.search-result-item');
    if (items[index]) items[index].focus();
}

function dialMatchesSearch(dial, query) {
    return dial.name.toLowerCase().includes(query)
        || (dial.url && dial.url.toLowerCase().includes(query));
}

function jumpToDial(dial, tab) {
    clearSearch();

    // Switch to the dial's tab if needed
    if (tab.id !== activeTabId) {
        activeTabId = tab.id;
        render();
    }

    // Scroll to and shake the card
    requestAnimationFrame(() => {
        const card = document.querySelector(`.dial-card[data-id="${dial.id}"]`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('dial-just-dropped');
            card.addEventListener('animationend', () => card.classList.remove('dial-just-dropped'), { once: true });
        }
    });
}
