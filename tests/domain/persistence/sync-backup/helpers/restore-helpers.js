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
        if (diff.todoLists_patch || diff.todoItems_patch) {
            result.todoLists = applyTodoListsDiffPatch(result.todoLists, diff.todoLists_patch, diff.todoItems_patch);
        }
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

function applyTodoListsDiffPatch(baseTodoLists, listsPatch, itemsPatchByListId) {
    const deleteSet = new Set(listsPatch?.delete || []);
    const upsertMap = new Map((listsPatch?.upsert || []).map(item => [item.id, item]));

    const result = (baseTodoLists || [])
        .filter(list => !deleteSet.has(list.id))
        .map(list => {
            const listCopy = {
                ...list,
                items: Array.isArray(list.items) ? [...list.items] : []
            };
            if (!upsertMap.has(list.id)) return listCopy;
            const listPatch = upsertMap.get(list.id);
            const merged = { ...listCopy, ...listPatch };
            if (!Array.isArray(listPatch.items)) {
                merged.items = listCopy.items;
            }
            return merged;
        });

    const existingIds = new Set(result.map(list => list.id));
    for (const listPatch of (listsPatch?.upsert || [])) {
        if (existingIds.has(listPatch.id)) continue;
        const newList = { ...listPatch };
        if (!Array.isArray(newList.items)) newList.items = [];
        result.push(newList);
    }

    for (const list of result) {
        const itemPatch = itemsPatchByListId?.[list.id];
        if (!itemPatch) continue;
        list.items = applyArrayPatch(Array.isArray(list.items) ? list.items : [], itemPatch);
    }

    return result;
}

module.exports = {
    applyArrayPatch,
    applyDiff
};

