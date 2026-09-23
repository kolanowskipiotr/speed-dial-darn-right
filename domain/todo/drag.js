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

    if (!_moveOrderIdRelative(list.itemOrder, dragId, targetId, insertBefore)) return;

    saveData();
    renderTodoPanel(_getTodoContainer());
}

function _reorderTodoList(dragListId, targetListId, insertBefore) {
    if (!_moveOrderIdRelative(data.todoListOrder, dragListId, targetListId, insertBefore)) return;

    saveData();
    renderTodoPanel(_getTodoContainer());
}
