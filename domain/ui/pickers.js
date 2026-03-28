// ─── EMOJI PICKER ───────────────────────────────────────────────
let _emojiPickerCallback = null;
let _emojiPickerType = null; // 'dial' | 'group' | 'tab' | 'todoList'

function initEmojiPickers() {
    // Attach click listener to close pickers when clicking outside
    document.addEventListener('mousedown', e => {
        if (!e.target.closest('.emoji-picker') && !e.target.closest('.emoji-preview') && !e.target.closest('.btn-random-emoji')) {
            document.querySelectorAll('.emoji-picker').forEach(p => p.classList.remove('open'));
        }
    });
}

function toggleEmojiPicker(type) {
    const picker = document.getElementById(type + 'EmojiPicker');
    const wasOpen = picker.classList.contains('open');
    document.querySelectorAll('.emoji-picker').forEach(p => p.classList.remove('open'));
    if (!wasOpen) {
        picker.classList.add('open');
        _emojiPickerType = type;
        renderEmojiPicker(type);
    }
}

function renderEmojiPicker(type, filter = '') {
    const picker = document.getElementById(type + 'EmojiPicker');
    if (!picker) return;
    picker.innerHTML = '';

    // Search wrap
    const searchWrap = document.createElement('div');
    searchWrap.className = 'emoji-search-wrap';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'emoji-search';
    searchInput.placeholder = `${ICONS.search} Search emojis…`;
    searchInput.autocomplete = 'off';
    searchWrap.appendChild(searchInput);
    
    const clearBtn = document.createElement('button');
    clearBtn.className = 'emoji-search-clear';
    clearBtn.innerHTML = '×';
    clearBtn.onclick = () => { searchInput.value = ''; renderCategories(''); searchInput.focus(); };
    searchWrap.appendChild(clearBtn);
    
    picker.appendChild(searchWrap);

    const categoriesWrap = document.createElement('div');
    categoriesWrap.className = 'emoji-categories-wrap';
    picker.appendChild(categoriesWrap);

    function renderCategories(query) {
        categoriesWrap.innerHTML = '';
        EMOJI_CATEGORIES.forEach(cat => {
            const matched = query ? cat.emojis.filter(e => emojiMatchesFilter(e, query)) : cat.emojis;
            if (!matched.length) return;

            const catEl = document.createElement('div');
            catEl.className = 'emoji-category';
            
            const title = document.createElement('div');
            title.className = 'emoji-category-title';
            title.textContent = cat.label;
            catEl.appendChild(title);

            const grid = document.createElement('div');
            grid.className = 'emoji-grid';
            matched.forEach(emoji => {
                const btn = document.createElement('button');
                btn.className = 'emoji-item';
                btn.textContent = emoji;
                btn.title = emojiName(emoji);
                btn.onclick = () => selectEmoji(type, emoji);
                grid.appendChild(btn);
            });
            catEl.appendChild(grid);
            categoriesWrap.appendChild(catEl);
        });

        if (!categoriesWrap.children.length) {
            categoriesWrap.innerHTML = '<div class="emoji-no-results">No emojis found</div>';
        }
    }

    renderCategories(filter);

    searchInput.addEventListener('input', () => {
        renderCategories(searchInput.value.trim().toLowerCase());
    });

    // Auto-focus search
    setTimeout(() => searchInput.focus(), 50);
}

function selectEmoji(type, emoji) {
    if (type === 'dial') {
        currentDialEmoji = emoji;
        document.getElementById('dialEmojiPreview').textContent = emoji;
    } else if (type === 'group') {
        currentGroupEmoji = emoji;
        document.getElementById('groupEmojiPreview').textContent = emoji;
    } else if (type === 'tab') {
        currentTabEmoji = emoji;
        document.getElementById('tabEmojiPreview').textContent = emoji;
    } else if (type === 'todoList') {
        currentTodoListEmoji = emoji;
        document.getElementById('todoListEmojiPreview').textContent = emoji;
    }
    document.getElementById(type + 'EmojiPicker').classList.remove('open');
}

function randomEmoji(type) {
    const e = pickRandomEmoji(EMOJI_LIST);
    selectEmoji(type, e);
}

function setNoIcon(type) {
    selectEmoji(type, '');
    if (type === 'tab') {
        document.getElementById('tabEmojiPreview').textContent = '🚫';
    }
}

function emojiName(emoji) {
    return EMOJI_KEYWORDS[emoji] || 'emoji';
}

function emojiMatchesFilter(emoji, query) {
    const name = EMOJI_KEYWORDS[emoji];
    if (!name) return false;
    return name.includes(query);
}

function _isRtl() {
    return document.documentElement.dir === 'rtl' || getComputedStyle(document.body).direction === 'rtl';
}
