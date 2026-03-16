// ─── RENDER ────────────────────────────────────────────────────
function renderTabs() {
    const bar = document.getElementById('tabsBar');
    bar.innerHTML = '';
    let tabDragSrc = null;

    data.tabs.forEach(tab => {
        const btn = document.createElement('button');
        btn.dataset.tabId = tab.id;
        btn.className = 'tab-btn' + (tab.id === activeTabId ? ' active' : '');
        btn.innerHTML = `${tab.emoji ? `<span>${tab.emoji}</span>` : ''}${tab.name ? `<span>${tab.name}</span>` : ''}`;
        btn.onclick = () => { activeTabId = tab.id; render(); };

        // Edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'tab-edit-btn';
        editBtn.title = 'Edit / delete tab';
        editBtn.textContent = ICONS.edit;
        editBtn.onclick = (e) => { e.stopPropagation(); openTabModal(tab.id); };
        btn.appendChild(editBtn);

        // Drag to reorder tabs (edit mode only)
        btn.draggable = editMode;
        btn.addEventListener('dragstart', e => {
            if (!editMode) { e.preventDefault(); return; }
            tabDragSrc = tab.id;
            e.dataTransfer.effectAllowed = 'move';
            btn.classList.add('dragging');
        });
        btn.addEventListener('dragend', () => btn.classList.remove('dragging'));
        btn.addEventListener('dragenter', e => {
            // dragstart fires before dragenter, so dragSrcType is already set here
            if (dragSrcType === 'dial' && tab.id !== activeTabId) { btn.classList.add('dial-drag-over'); }
        });
        btn.addEventListener('dragover', e => {
            if (tabDragSrc && tabDragSrc !== tab.id) {
                e.preventDefault();
                const rect = btn.getBoundingClientRect();
                btn.classList.toggle('drop-before', e.clientX < rect.left + rect.width / 2);
                btn.classList.toggle('drop-after',  e.clientX >= rect.left + rect.width / 2);
                return;
            }
            // Always accept on a different tab — drop handler guards logic
            if (tab.id !== activeTabId) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragSrcType === 'dial') btn.classList.add('dial-drag-over');
            }
        });
        btn.addEventListener('dragleave', e => {
            if (btn.contains(e.relatedTarget)) return;
            btn.classList.remove('drop-before', 'drop-after', 'dial-drag-over');
        });
        btn.addEventListener('drop', e => {
            btn.classList.remove('drop-before', 'drop-after', 'dial-drag-over');
            // Tab reorder
            if (tabDragSrc && tabDragSrc !== tab.id) {
                e.preventDefault();
                const srcIdx = data.tabs.findIndex(t => t.id === tabDragSrc);
                let tgtIdx = data.tabs.findIndex(t => t.id === tab.id);
                if (srcIdx === -1 || tgtIdx === -1) return;
                const rect = btn.getBoundingClientRect();
                const insertAfter = e.clientX >= rect.left + rect.width / 2;
                const [moved] = data.tabs.splice(srcIdx, 1);
                tgtIdx = data.tabs.findIndex(t => t.id === tab.id);
                data.tabs.splice(insertAfter ? tgtIdx + 1 : tgtIdx, 0, moved);
                tabDragSrc = null;
                saveData(); renderTabs();
                return;
            }
            // Dial dropped onto a different tab → move to first group, first position
            if (dragSrcType === 'dial' && tab.id !== activeTabId) {
                e.preventDefault();
                e.stopPropagation();
                const srcTab = data.tabs.find(t => t.id === dragSrcTabId);
                const tgtTab = data.tabs.find(t => t.id === tab.id);
                if (!srcTab || !tgtTab || !tgtTab.groups.length) return;
                const srcGroup = srcTab.groups.find(g => g.id === dragSrcGroupId);
                if (!srcGroup) return;
                const srcIdx = srcGroup.dials.findIndex(d => d.id === dragSrcDialId);
                if (srcIdx === -1) return;
                const [dial] = srcGroup.dials.splice(srcIdx, 1);
                tgtTab.groups[0].dials.unshift(dial); // first group, first position
                activeTabId = tab.id;
                saveData(); render(); resetHoverAfterDrag();
                // Glow + shake the placed dial
                requestAnimationFrame(() => {
                    const card = document.querySelector(`.dial-card[data-id="${dial.id}"]`);
                    if (card) {
                        card.classList.add('dial-just-dropped');
                        card.addEventListener('animationend', () => card.classList.remove('dial-just-dropped'), { once: true });
                    }
                });
            }
        });

        bar.appendChild(btn);
    });

    // Add tab button
    const addBtn = document.createElement('button');
    addBtn.className = 'tab-btn add-tab-btn';
    addBtn.innerHTML = '＋ Tab';
    addBtn.onclick = () => openTabModal(null);
    bar.appendChild(addBtn);

    // Inline group jump chips
    const activeTab = data.tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.groups && activeTab.groups.length > 0) {
        const sep = document.createElement('div');
        sep.className = 'tabs-groups-sep';
        bar.appendChild(sep);

        activeTab.groups.forEach(group => {
            const chip = document.createElement('button');
            chip.className = 'group-jump-chip';
            chip.innerHTML = `${group.emoji ? `<span>${group.emoji}</span>` : ''}<span>${group.name}</span>`;
            chip.title = `Jump to ${group.name}`;
            chip.onclick = () => {
                const el = document.querySelector(`.group[data-id="${group.id}"]`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            };
            bar.appendChild(chip);
        });
    }
}

function trackDialVisit(dialId) {
    for (const tab of data.tabs) {
        for (const group of tab.groups || []) {
            const dial = group.dials.find(d => d.id === dialId);
            if (dial) {
                dial.visitCount = (dial.visitCount || 0) + 1;
                saveData();
                return;
            }
        }
    }
}

function renderHomeTab() {
    const container = document.getElementById('groupsContainer');
    const empty = document.getElementById('emptyState');
    container.innerHTML = '';
    empty.style.display = 'none';
    document.getElementById('addGroupBtn').style.display = 'none';

    // Collect all visited dials across non-home tabs
    const visitedDials = [];
    for (const tab of data.tabs) {
        if (tab.isHome) continue;
        for (const group of tab.groups || []) {
            for (const dial of group.dials || []) {
                if ((dial.visitCount || 0) > 0) {
                    visitedDials.push({ dial, groupId: group.id, groupName: group.name, tabName: tab.name });
                }
            }
        }
    }
    visitedDials.sort((a, b) => (b.dial.visitCount || 0) - (a.dial.visitCount || 0));

    if (!visitedDials.length) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'empty-state';
        emptyEl.innerHTML = `<div class="empty-icon">⭐</div><p>No frequently used dials yet.<br>Click dials on other tabs and they'll appear here.</p>`;
        container.appendChild(emptyEl);
        return;
    }

    const section = document.createElement('div');
    section.className = 'home-section';

    const heading = document.createElement('div');
    heading.className = 'home-section-heading';
    heading.textContent = 'Frequently Used';
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'dials-grid';
    grid.style.setProperty('--dial-size', '140px');

    visitedDials.forEach(({ dial, groupId, groupName, tabName }) => {
        grid.appendChild(makeDialCard(dial, groupId, 0, 0, { showMeta: true, tabName, groupName }));
    });

    section.appendChild(grid);
    container.appendChild(section);
}

function render() {
    renderTabs();
    updateDialCount();
    const container = document.getElementById('groupsContainer');
    const empty = document.getElementById('emptyState');
    container.innerHTML = '';

    const tab = getActiveTab();

    if (tab?.isHome) {
        renderHomeTab();
        return;
    }

    const groups = tab ? tab.groups : [];

    document.getElementById('addGroupBtn').style.display = '';  // let CSS control via body.edit-mode

    if (!groups.length) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    groups.forEach((group, gi) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'group';
        groupEl.dataset.id = group.id;
        groupEl.draggable = false;

        // Group header
        const header = document.createElement('div');
        header.className = 'group-header';

        const handle = document.createElement('div');
        handle.className = 'group-drag-handle';
        handle.innerHTML = '⠿';
        handle.title = 'Drag to reorder group';
        handle.addEventListener('mousedown', () => { groupEl.draggable = true; });
        handle.addEventListener('touchstart', () => { groupEl.draggable = true; }, {passive:true});
        groupEl.addEventListener('dragend', () => { groupEl.draggable = false; });

        const nameSpan = document.createElement('span');
        nameSpan.className = 'group-name';
        nameSpan.textContent = group.name;

        header.appendChild(handle);
        if (group.emoji) {
            const emojiSpan = document.createElement('span');
            emojiSpan.className = 'group-emoji';
            emojiSpan.textContent = group.emoji;
            header.appendChild(emojiSpan);
        }
        header.appendChild(nameSpan);

        const line = document.createElement('div');
        line.className = 'group-header-line';
        header.appendChild(line);

        // Group controls
        const controls = document.createElement('div');
        controls.className = 'group-edit-controls';
        controls.innerHTML = `
      <button class="btn-icon" title="Move up" onclick="moveGroup('${group.id}', -1)">↑</button>
      <button class="btn-icon" title="Move down" onclick="moveGroup('${group.id}', 1)">↓</button>
      <button class="btn-icon" title="Edit group" onclick="openGroupModal('${group.id}')">${ICONS.edit}</button>
      <button class="btn-icon danger" title="Delete group" onclick="deleteGroup('${group.id}')">${ICONS.delete}</button>
    `;
        header.appendChild(controls);
        groupEl.appendChild(header);

        // Dials grid
        const grid = document.createElement('div');
        grid.className = 'dials-grid';
        grid.dataset.groupId = group.id;
        grid.style.setProperty('--dial-size', (group.dialSize || 140) + 'px');

        group.dials.forEach((dial, di) => {
            grid.appendChild(makeDialCard(dial, group.id, gi, di));
        });

        // Add dial button
        const addBtn = document.createElement('div');
        addBtn.className = 'dial-card add-dial-btn';
        addBtn.innerHTML = `<span class="add-icon">＋</span><span class="add-label">Add Dial</span>`;
        addBtn.onclick = () => openDialModal(null, group.id);
        grid.appendChild(addBtn);

        // Accept dial drops on the grid itself (empty groups or empty area)
        grid.addEventListener('dragover', e => {
            if (dragSrcType !== 'dial') return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            grid.classList.add('dial-drag-over');
        });
        grid.addEventListener('dragleave', e => {
            if (!grid.contains(e.relatedTarget)) grid.classList.remove('dial-drag-over');
        });
        grid.addEventListener('drop', e => {
            if (dragSrcType !== 'dial') return;
            e.preventDefault();
            e.stopPropagation();
            grid.classList.remove('dial-drag-over');
            clearDropIndicators();
            onDialDropOnGroup(group.id);
        });

        groupEl.appendChild(grid);

        // Group drag events
        groupEl.addEventListener('dragstart', e => onGroupDragStart(e, group.id));
        groupEl.addEventListener('dragover', e => onGroupDragOver(e, group.id));
        groupEl.addEventListener('drop', e => onGroupDrop(e, group.id));
        groupEl.addEventListener('dragleave', e => groupEl.classList.remove('drag-over'));

        container.appendChild(groupEl);
    });
}

function makeDialCard(dial, groupId, gi, di, opts = {}) {
    const card = document.createElement('div');
    card.dataset.id = dial.id;
    card.dataset.groupId = groupId;

    const isScreenshot = dial.iconType === 'custom' && dial.icon;

    if (isScreenshot) {
        // ── Full-bleed screenshot card ────────────────────────────────
        card.className = 'dial-card dial-screenshot';

        const img = document.createElement('img');
        img.className = 'dial-screenshot-img';
        img.alt = '';
        img.src = dial.icon;
        img.onload  = () => img.classList.add('loaded');
        img.onerror = () => {
            // fallback to emoji if screenshot image fails
            card.className = 'dial-card';
            img.remove();
            const wrap = document.createElement('div');
            wrap.className = 'dial-icon-wrap';
            wrap.innerHTML = `<span class="dial-emoji">${dial.emoji || ICONS.faviconFallback}</span>`;
            card.insertBefore(wrap, card.firstChild);
        };
        card.appendChild(img);

    } else {
        // ── Standard card (emoji / favicon / none) ───────────────────
        card.className = 'dial-card' + (dial.iconType === 'none' ? ' dial-no-icon' : '');

        if (dial.iconType !== 'none') {
            const iconWrap = document.createElement('div');
            iconWrap.className = 'dial-icon-wrap';

            if (dial.iconType === 'emoji' || !dial.iconType) {
                const em = document.createElement('span');
                em.className = 'dial-emoji';
                em.textContent = dial.emoji || ICONS.faviconFallback;
                iconWrap.appendChild(em);
            } else {
                // favicon
                const img = document.createElement('img');
                img.alt = '';
                img.style.cssText = 'opacity:0;transition:opacity 0.2s';
                img.onload = () => { img.style.opacity = '1'; };
                iconWrap.appendChild(img);
                if (dial.icon) {
                    img.onerror = () => attachFavicon(img, dial.url, dial.emoji || ICONS.faviconFallback);
                    img.src = dial.icon;
                } else {
                    attachFavicon(img, dial.url, dial.emoji || ICONS.faviconFallback);
                }
            }
            card.appendChild(iconWrap);
        }
    }

    // Name label (both types)
    const name = document.createElement('div');
    name.className = 'dial-name';
    name.textContent = dial.name;
    card.appendChild(name);

    // Meta label: tab / group context (shown on home tab)
    if (opts.showMeta) {
        const meta = document.createElement('div');
        meta.className = 'dial-meta';
        meta.textContent = `${opts.tabName} · ${opts.groupName}`;
        card.appendChild(meta);
    }

    if (!opts.showMeta) {
        // Edit overlay
        const overlay = document.createElement('div');
        overlay.className = 'dial-edit-overlay';
        overlay.innerHTML = `
    <div class="dial-overlay-btns">
      <button class="btn-icon" title="Move left" onclick="moveDial('${groupId}','${dial.id}',-1)">←</button>
      <button class="btn-icon" title="Edit" onclick="openDialModal('${dial.id}','${groupId}')">${ICONS.edit}</button>
      <button class="btn-icon danger" title="Delete" onclick="deleteDial('${groupId}','${dial.id}')">${ICONS.delete}</button>
      <button class="btn-icon" title="Move right" onclick="moveDial('${groupId}','${dial.id}',1)">→</button>
    </div>
  `;

        // Drag handle overlay
        const dragHandle = document.createElement('div');
        dragHandle.className = 'dial-drag-handle-overlay';
        dragHandle.innerHTML = '⠿';
        dragHandle.title = 'Drag to reorder';
        card.draggable = editMode;
        card.addEventListener('dragend', () => { card.classList.remove('dragging'); });

        card.appendChild(dragHandle);
        card.appendChild(overlay);

        // Dial drag events
        card.addEventListener('dragstart', e => onDialDragStart(e, groupId, dial.id));
        card.addEventListener('dragover', e => onDialDragOver(e, groupId, dial.id));
        card.addEventListener('drop', e => onDialDrop(e, groupId, dial.id));
    }

    // Click to open
    card.addEventListener('click', e => {
        if (editMode) return;
        if (e.target.closest('.dial-edit-overlay') || e.target.closest('.dial-drag-handle-overlay')) return;
        trackDialVisit(dial.id);
        window.open(dial.url, '_blank');
    });

    return card;
}

function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function updateClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const clockEl = document.getElementById('headerClock');
    const dateEl  = document.getElementById('headerDate');
    if (clockEl) clockEl.textContent = `${hh}:${mm}:${ss}`;
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
}

function updateDialCount() {
    const el = document.getElementById('headerDialCount');
    if (!el) return;
    const tab = data.tabs.find(t => t.id === activeTabId);
    if (!tab) { el.textContent = ''; return; }
    if (tab.isHome) {
        let count = 0;
        for (const t of data.tabs) {
            if (t.isHome) continue;
            for (const g of t.groups || []) count += (g.dials || []).filter(d => (d.visitCount || 0) > 0).length;
        }
        el.textContent = count ? `${count} frequently used dial${count !== 1 ? 's' : ''}` : '';
        return;
    }
    const totalDials = (tab.groups || []).reduce((n, g) => n + (g.dials || []).length, 0);
    const totalGroups = (tab.groups || []).length;
    el.textContent = `${totalGroups} group${totalGroups !== 1 ? 's' : ''} · ${totalDials} dial${totalDials !== 1 ? 's' : ''}`;
}
