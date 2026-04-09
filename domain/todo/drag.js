// ─── DRAG HELPERS ─────────────────────────────────────────────────

function _clearTodoDragIndicators() {
    document.querySelectorAll(
        '.todo-item.todo-drop-before, .todo-item.todo-drop-after, ' +
        '.todo-list.todo-list-drop-before, .todo-list.todo-list-drop-after, ' +
        '.todo-list-header.todo-list-drag-over'
    ).forEach(el => el.classList.remove(
        'todo-drop-before', 'todo-drop-after',
        'todo-list-drop-before', 'todo-list-drop-after',
        'todo-list-drag-over'
    ));
}

function _reorderTodoItem(dragId, listId, targetId, insertBefore) {
    const list = findTodoList(listId);
    if (!list) return;

    // Work only on active (non-done) items sorted by current order
    const activeItems = list.items
        .filter(i => !i.isDone)
        .sort((a, b) => a.order - b.order);

    const dragIdx  = activeItems.findIndex(i => i.id === dragId);
    const targetIdx = activeItems.findIndex(i => i.id === targetId);
    if (dragIdx === -1 || targetIdx === -1) return;

    // Remove drag item, reinsert at target position
    const [moved] = activeItems.splice(dragIdx, 1);
    const newTargetIdx = activeItems.findIndex(i => i.id === targetId);
    activeItems.splice(insertBefore ? newTargetIdx : newTargetIdx + 1, 0, moved);

    // Write back sequential order values
    activeItems.forEach((item, i) => { item.order = i; });

    saveData();
    renderTodoPanel(_getTodoContainer());
}

function _reorderTodoList(dragListId, targetListId, insertBefore) {
    const lists = [...data.todoLists].sort((a, b) => a.order - b.order);
    const dragIdx  = lists.findIndex(l => l.id === dragListId);
    const targetIdx = lists.findIndex(l => l.id === targetListId);
    if (dragIdx === -1 || targetIdx === -1) return;

    const [moved] = lists.splice(dragIdx, 1);
    const newTargetIdx = lists.findIndex(l => l.id === targetListId);
    lists.splice(insertBefore ? newTargetIdx : newTargetIdx + 1, 0, moved);

    lists.forEach((list, i) => { list.order = i; });

    saveData();
    renderTodoPanel(_getTodoContainer());
}
