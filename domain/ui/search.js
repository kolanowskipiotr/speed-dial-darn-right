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
        if (e.key === 'Enter') {
            const q = searchQuery.trim();
            if (q) window.location.href = 'https://www.google.com/search?q=' + encodeURIComponent(q);
        }
    });

    // Close results when clicking outside the search wrap
    document.addEventListener('click', e => {
        if (!e.target.closest('#headerSearchWrap')) {
            hideSearchResults();
        }
    });

    const searchWrap = document.getElementById('headerSearchWrap');
    const isHidden = !!(searchWrap && getComputedStyle(searchWrap).display === 'none');
    if (!isHidden) {
        if (document.hasFocus()) {
            input.focus();
        } else {
            window.addEventListener('focus', () => input.focus(), { once: true });
        }

        // Replay any text typed before JS initialized (captured via autofocus + early browser focus).
        // data is already loaded at this point (loadData() runs before initSearch() in init.js).
        if (input.value) {
            searchQuery = input.value;
            renderSearchResults();
        }
    } else {
        // Search is hidden — cancel the autofocus so focus isn't trapped on an invisible element.
        input.blur();
    }
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

function tokenize(s) {
    return (s.match(/\p{L}+|\p{N}+/gu) || []).map(t => t.toLowerCase());
}

function scoreResult(texts, tokens) {
    const combined = texts.join(' ').toLowerCase();
    return tokens.filter(t => combined.includes(t)).length;
}

function renderSearchResults() {
    const dropdown = document.getElementById('searchDropdown');
    if (!dropdown) return;

    const q = searchQuery.trim().toLowerCase();
    if (!q) {
        dropdown.style.display = 'none';
        return;
    }

    const tokens = tokenize(q);
    if (!tokens.length) {
        dropdown.style.display = 'none';
        return;
    }

    // Collect all matching dials across all tabs
    const dialResults = [];
    data.tabs.forEach(tab => {
        tab.groups.forEach(group => {
            group.dials.forEach(dial => {
                const score = scoreResult([dial.name, dial.url || ''], tokens);
                if (score > 0) dialResults.push({ type: 'dial', dial, group, tab, score });
            });
        });
    });

    // Collect all matching todo lists and items
    const todoResults = [];
    (data.todoLists || []).forEach(list => {
        const listScore = scoreResult([list.name], tokens);
        if (listScore > 0) todoResults.push({ type: 'todoList', list, score: listScore });
        list.items.forEach(item => {
            const score = scoreResult([item.content], tokens);
            if (score > 0) todoResults.push({ type: 'todoItem', item, list, score });
        });
    });

    // Collect matching notes
    const noteResults = [];
    (data.notes || []).forEach(note => {
        const score = scoreResult([note.name, note.content], tokens);
        if (score > 0) noteResults.push({ type: 'note', note, score });
    });

    const results = [...dialResults, ...todoResults, ...noteResults]
        .sort((a, b) => b.score - a.score);

    dropdown.innerHTML = '';

    if (!results.length) {
        const msg = document.createElement('div');
        msg.className = 'search-no-results';
        msg.textContent = 'No results found';
        dropdown.appendChild(msg);
        dropdown.style.display = 'block';
        return;
    }

    results.forEach((result, i) => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.tabIndex = 0;

        if (result.type === 'dial') {
            const { dial, group, tab } = result;

            // Icon
            const iconWrap = document.createElement('div');
            iconWrap.className = 'search-result-icon';
            if (dial.iconType === 'none') {
                iconWrap.textContent = ICONS.faviconFallback;
            } else if (dial.iconType === 'emoji' || !dial.iconType) {
                iconWrap.textContent = dial.emoji || ICONS.faviconFallback;
            } else {
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

        } else if (result.type === 'todoList') {
            const { list } = result;

            const iconWrap = document.createElement('div');
            iconWrap.className = 'search-result-icon';
            iconWrap.textContent = list.emoji || ICONS.defaultTodoList;

            const textWrap = document.createElement('div');
            textWrap.className = 'search-result-text';

            const nameEl = document.createElement('div');
            nameEl.className = 'search-result-name';
            nameEl.textContent = list.name;

            const metaEl = document.createElement('div');
            metaEl.className = 'search-result-meta';
            metaEl.textContent = 'To-do list';

            textWrap.appendChild(nameEl);
            textWrap.appendChild(metaEl);
            item.appendChild(iconWrap);
            item.appendChild(textWrap);

            item.addEventListener('click', () => jumpToTodoList(list));
            item.addEventListener('keydown', e => {
                if (e.key === 'Enter') jumpToTodoList(list);
                if (e.key === 'ArrowDown') { e.preventDefault(); focusSearchResult(i + 1); }
                if (e.key === 'ArrowUp') { e.preventDefault(); i > 0 ? focusSearchResult(i - 1) : document.getElementById('searchInput').focus(); }
                if (e.key === 'Escape') { clearSearch(); document.getElementById('searchInput').blur(); }
            });

        } else if (result.type === 'todoItem') {
            const { item: todoItem, list } = result;

            const iconWrap = document.createElement('div');
            iconWrap.className = 'search-result-icon';
            iconWrap.textContent = todoItem.isDone ? ICONS.check : ICONS.uncheck;

            const textWrap = document.createElement('div');
            textWrap.className = 'search-result-text';

            const nameEl = document.createElement('div');
            nameEl.className = 'search-result-name';
            nameEl.textContent = getFirstLine(todoItem.content) || todoItem.content.slice(0, 60);

            const metaEl = document.createElement('div');
            metaEl.className = 'search-result-meta';
            const listPrefix = list.emoji ? list.emoji + ' ' : '';
            metaEl.textContent = `${listPrefix}${list.name}${todoItem.isDone ? ' · Done' : ''}`;

            textWrap.appendChild(nameEl);
            textWrap.appendChild(metaEl);
            item.appendChild(iconWrap);
            item.appendChild(textWrap);

            item.addEventListener('click', () => jumpToTodoItem(todoItem, list));
            item.addEventListener('keydown', e => {
                if (e.key === 'Enter') jumpToTodoItem(todoItem, list);
                if (e.key === 'ArrowDown') { e.preventDefault(); focusSearchResult(i + 1); }
                if (e.key === 'ArrowUp') { e.preventDefault(); i > 0 ? focusSearchResult(i - 1) : document.getElementById('searchInput').focus(); }
                if (e.key === 'Escape') { clearSearch(); document.getElementById('searchInput').blur(); }
            });

        } else if (result.type === 'note') {
            const { note } = result;

            const iconWrap = document.createElement('div');
            iconWrap.className = 'search-result-icon';
            iconWrap.textContent = ICONS.defaultNote;

            const textWrap = document.createElement('div');
            textWrap.className = 'search-result-text';

            const nameEl = document.createElement('div');
            nameEl.className = 'search-result-name';
            nameEl.textContent = note.name;

            const metaEl = document.createElement('div');
            metaEl.className = 'search-result-meta';
            // Find snippet: line containing query
            const snippet = (() => {
                const line = (note.content || '').split('\n').find(l => l.toLowerCase().includes(q)) || '';
                return 'Note · ' + (line.length > 60 ? line.slice(0, 60) + '…' : line);
            })();
            metaEl.textContent = snippet;

            textWrap.appendChild(nameEl);
            textWrap.appendChild(metaEl);
            item.appendChild(iconWrap);
            item.appendChild(textWrap);

            item.addEventListener('click', () => jumpToNote(note));
            item.addEventListener('keydown', e => {
                if (e.key === 'Enter') jumpToNote(note);
                if (e.key === 'ArrowDown') { e.preventDefault(); focusSearchResult(i + 1); }
                if (e.key === 'ArrowUp') { e.preventDefault(); i > 0 ? focusSearchResult(i - 1) : document.getElementById('searchInput').focus(); }
                if (e.key === 'Escape') { clearSearch(); document.getElementById('searchInput').blur(); }
            });
        }

        dropdown.appendChild(item);
    });

    dropdown.style.display = 'block';
}

function focusSearchResult(index) {
    const items = document.querySelectorAll('.search-result-item');
    if (items[index]) items[index].focus();
}


function jumpToTodoList(list) {
    clearSearch();
    activeTodoListId = list.id;
    renderTodoPanel(_getTodoContainer());
    requestAnimationFrame(() => {
        const listEl = document.querySelector(`.todo-list[data-list-id="${list.id}"]`);
        if (listEl) listEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}

function jumpToTodoItem(todoItem, list) {
    clearSearch();
    activeTodoListId = list.id;
    if (todoItem.isDone) {
        doneExpandedListId = list.id;
    }
    expandedItemId = todoItem.id;
    renderTodoPanel(_getTodoContainer());
    requestAnimationFrame(() => {
        const row = document.querySelector(`.todo-item[data-item-id="${todoItem.id}"]`);
        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}

function jumpToNote(note) {
    const savedQuery = searchQuery; // save before clearSearch() resets it
    clearSearch();
    const homeTab = data.tabs.find(t => t.isHome);
    if (homeTab && activeTabId !== homeTab.id) {
        activeTabId = homeTab.id;
        render();
    }
    activeNoteId = note.id;
    _notesSearchHighlight = { noteId: note.id, query: savedQuery };
    requestAnimationFrame(() => {
        const container = document.querySelector('.home-col-notes');
        if (container) renderNotesPanel(container);
    });
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
