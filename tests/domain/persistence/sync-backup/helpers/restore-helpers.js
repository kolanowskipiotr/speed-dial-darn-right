function applyArrayPatch(baseArr, patch) {
    const upsertMap = new Map((patch.upsert || []).map(item => [item.id, item]));
    const deleteSet = new Set(patch.delete || []);

    const result = baseArr
        .filter(item => !deleteSet.has(item.id))
        .map(item => upsertMap.has(item.id) ? upsertMap.get(item.id) : item);

    const existingIds = new Set(baseArr.map(item => item.id));
    for (const item of (patch.upsert || [])) {
        if (!existingIds.has(item.id)) result.push(item);
    }

    return result;
}

function applyDiff(fullData, diff) {
    const result = {
        tabs: fullData.tabs || [],
        todoLists: fullData.todoLists || [],
        notes: fullData.notes || [],
        notesTrash: fullData.notesTrash || [],
        _config: fullData._config,
        _images: fullData._images || {},
        _exportMeta: fullData._exportMeta
    };

    const isNewFormat = diff._meta?.diffFormat === 2
        || Object.keys(diff).some(k => k.endsWith('_patch'));

    if (isNewFormat) {
        if (diff.tabs_patch) result.tabs = applyArrayPatch(result.tabs, diff.tabs_patch);
        if (diff.todoLists_patch) result.todoLists = applyArrayPatch(result.todoLists, diff.todoLists_patch);
        if (diff.notes_patch) result.notes = applyArrayPatch(result.notes, diff.notes_patch);
        if (diff.notesTrash_patch) result.notesTrash = applyArrayPatch(result.notesTrash, diff.notesTrash_patch);
    } else {
        if (diff.tabs !== undefined) result.tabs = diff.tabs;
        if (diff.todoLists !== undefined) result.todoLists = diff.todoLists;
        if (diff.notes !== undefined) result.notes = diff.notes;
        if (diff.notesTrash !== undefined) result.notesTrash = diff.notesTrash;
    }

    if (diff._config !== undefined) result._config = diff._config;
    if (diff._images !== undefined) result._images = { ...result._images, ...diff._images };

    return result;
}

module.exports = {
    applyArrayPatch,
    applyDiff
};

