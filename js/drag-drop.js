// ─── DRAG & DROP: DIALS ─────────────────────────────────────────
function clearDropIndicators() {
    document.querySelectorAll('.drop-before, .drop-after').forEach(el => {
        el.classList.remove('drop-before', 'drop-after');
    });
    document.querySelectorAll('.dials-grid.dial-drag-over').forEach(el => {
        el.classList.remove('dial-drag-over');
    });
}

function onDialDragStart(e, groupId, dialId) {
    e.stopPropagation(); // prevent group dragstart handler from cancelling this
    dragSrcType = 'dial';
    dragSrcGroupId = groupId;
    dragSrcDialId = dialId;
    dragSrcTabId = activeTabId;
    e.dataTransfer.effectAllowed = 'move';
    const card = e.currentTarget;
    card.classList.add('dragging');

}

function onDialDragOver(e, groupId, dialId) {
    if (dragSrcType !== 'dial') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    clearDropIndicators();
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    card.classList.add(e.clientX < rect.left + rect.width / 2 ? 'drop-before' : 'drop-after');
}

function onDialDrop(e, targetGroupId, targetDialId) {
    if (dragSrcType !== 'dial') return;
    e.preventDefault();
    e.stopPropagation();
    clearDropIndicators();

    const srcTab = data.tabs.find(t => t.id === dragSrcTabId);
    const tgtTab = getActiveTab();
    if (!srcTab || !tgtTab) return;

    const srcGroup = srcTab.groups.find(g => g.id === dragSrcGroupId);
    const tgtGroup = tgtTab.groups.find(g => g.id === targetGroupId);
    if (!srcGroup || !tgtGroup) return;

    const srcIdx = srcGroup.dials.findIndex(d => d.id === dragSrcDialId);
    if (srcIdx === -1) return;

    // Determine insert position from mouse location relative to target card
    const rect = e.currentTarget.getBoundingClientRect();
    const insertAfter = e.clientX >= rect.left + rect.width / 2;

    let tgtIdx = tgtGroup.dials.findIndex(d => d.id === targetDialId);

    // For same-group drops, removing src shifts later indices down by 1
    if (srcGroup === tgtGroup && tgtIdx !== -1 && srcIdx < tgtIdx) tgtIdx--;

    const finalIdx = tgtIdx === -1 ? tgtGroup.dials.length : (insertAfter ? tgtIdx + 1 : tgtIdx);
    // No-op: same group, same resulting position
    if (srcGroup === tgtGroup && srcIdx === finalIdx) return;

    const [dial] = srcGroup.dials.splice(srcIdx, 1);
    tgtGroup.dials.splice(tgtIdx === -1 ? tgtGroup.dials.length : (insertAfter ? tgtIdx + 1 : tgtIdx), 0, dial);

    saveData(); render(); resetHoverAfterDrag();
}

function onDialDropOnGroup(targetGroupId) {
    const srcTab = data.tabs.find(t => t.id === dragSrcTabId);
    const tgtTab = getActiveTab();
    if (!srcTab || !tgtTab) return;

    const srcGroup = srcTab.groups.find(g => g.id === dragSrcGroupId);
    const tgtGroup = tgtTab.groups.find(g => g.id === targetGroupId);
    if (!srcGroup || !tgtGroup) return;

    const srcIdx = srcGroup.dials.findIndex(d => d.id === dragSrcDialId);
    if (srcIdx === -1) return;

    // No-op: already first item in the same group
    if (srcGroup === tgtGroup && srcIdx === 0) return;

    const [dial] = srcGroup.dials.splice(srcIdx, 1);
    tgtGroup.dials.unshift(dial);
    saveData(); render(); resetHoverAfterDrag();
}

function resetHoverAfterDrag() {
    document.body.classList.add('post-drag');
    setTimeout(() => document.body.classList.remove('post-drag'), 300);
}

// ─── DRAG & DROP: GROUPS ────────────────────────────────────────
function onGroupDragStart(e, groupId) {
    if (!e.currentTarget.draggable) { e.preventDefault(); return; }
    dragSrcType = 'group';
    dragSrcGroupId = groupId;
    e.dataTransfer.effectAllowed = 'move';
}

function onGroupDragOver(e, groupId) {
    if (dragSrcType === 'group') {
        if (groupId === dragSrcGroupId) return;
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    } else if (dragSrcType === 'dial') {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }
}

function onGroupDrop(e, targetGroupId) {
    e.currentTarget.classList.remove('drag-over');
    if (dragSrcType === 'group') {
        e.preventDefault();
        if (dragSrcGroupId === targetGroupId) return;
        const groups = getActiveTab().groups;
        const srcIdx = groups.findIndex(g => g.id === dragSrcGroupId);
        const tgtIdx = groups.findIndex(g => g.id === targetGroupId);
        if (srcIdx === -1 || tgtIdx === -1) return;
        const [g] = groups.splice(srcIdx, 1);
        groups.splice(tgtIdx, 0, g);
        saveData(); render();
    } else if (dragSrcType === 'dial') {
        e.preventDefault();
        clearDropIndicators();
        onDialDropOnGroup(targetGroupId);
    }
}
