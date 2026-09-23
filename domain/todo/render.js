// ─── RENDER ──────────────────────────────────────────────────────

function renderTodoPanel(container) {
    if (!container) return;
    container.innerHTML = '';

    // If item editor is open, show the editor view
    if (editingTodoItemId) {
        _renderItemEditor(container);
        return;
    }

    // Panel header
    const header = document.createElement('div');
    header.className = 'todo-panel-header';
    header.innerHTML = `
        <span class="todo-panel-title">📋 To-Do Lists</span>
        <div class="todo-panel-header-actions">
            <button class="btn-icon todo-add-list-btn" title="Add new list" onclick="openTodoListModal(null)">＋</button>
            <button class="btn-icon todo-fullscreen-btn" title="Toggle full screen" onclick="toggleTodoFullScreen()">${todoFullScreen ? '⛶' : '⤢'}</button>
        </div>
    `;
    container.appendChild(header);

    // Accordion
    const accordion = document.createElement('div');
    accordion.className = 'todo-accordion';
    _renderTodoAccordion(accordion);
    container.appendChild(accordion);
}

function _renderTodoAccordion(container) {
    container.innerHTML = '';
    const lists = getOrderedTodoLists();

    if (!lists.length) {
        container.innerHTML = '<div class="todo-empty-panel">No lists yet — click ＋ to add one</div>';
        return;
    }

    // Default active list: first list if current is gone
    if (!activeTodoListId || !lists.find(l => l.id === activeTodoListId)) {
        activeTodoListId = lists[0].id;
    }

    lists.forEach(list => {
        const isActive = list.id === activeTodoListId;
        const listEl = document.createElement('div');
        listEl.className = 'todo-list' + (isActive ? ' active' : '');
        listEl.dataset.listId = list.id;

        // List header
        const listHeader = document.createElement('div');
        listHeader.className = 'todo-list-header ' + (isActive ? 'active' : 'collapsed');

        const activeCount = (list.items || []).filter(i => !i.isDone).length;
        const countBadge = !isActive
            ? `<span class="todo-list-count">${activeCount}</span>`
            : '';

        if (isActive) {
            listHeader.innerHTML = `
                <span class="todo-list-drag-handle" title="Drag to reorder">⠿</span>
                <span class="todo-list-chevron">▼</span>
                ${list.emoji ? `<span class="todo-list-emoji">${list.emoji}</span>` : ''}
                <span class="todo-list-name">${escHtml(list.name)}</span>
                <div class="todo-list-header-actions">
                    <button class="btn-icon" title="Add to top" onclick="addTodoItem('${list.id}','top')">⤒+</button>
                    <button class="btn-icon" title="Add to bottom" onclick="addTodoItem('${list.id}','bottom')">⤓+</button>
                    <button class="btn-icon" title="Edit list" onclick="openTodoListModal('${list.id}')">${ICONS.edit}</button>
                </div>
            `;
        } else {
            listHeader.innerHTML = `
                <span class="todo-list-drag-handle" title="Drag to reorder">⠿</span>
                <span class="todo-list-chevron">▶</span>
                ${list.emoji ? `<span class="todo-list-emoji">${list.emoji}</span>` : ''}
                <span class="todo-list-name">${escHtml(list.name)}</span>
                ${countBadge}
            `;
            listHeader.onclick = () => {
                activeTodoListId = list.id;
                renderTodoPanel(_getTodoContainer());
            };
        }

        // List header drag (for list reorder)
        listHeader.draggable = true;
        listHeader.addEventListener('dragstart', (e) => {
            if (_todoDragItemId) return; // item drag has priority
            _todoDragListElemId = list.id;
            e.dataTransfer.effectAllowed = 'move';
            e.stopPropagation();
            listEl.classList.add('todo-list-dragging');
        });
        listHeader.addEventListener('dragend', () => {
            listEl.classList.remove('todo-list-dragging');
            _clearTodoDragIndicators();
            _todoDragListElemId = null;
        });

        // Collapsed list header: accept item drops (cross-list move)
        if (!isActive) {
            listHeader.addEventListener('dragover', (e) => {
                if (_todoDragItemId) {
                    e.preventDefault();
                    e.stopPropagation();
                    listHeader.classList.add('todo-list-drag-over');
                } else if (_todoDragListElemId && _todoDragListElemId !== list.id) {
                    e.preventDefault();
                }
            });
            listHeader.addEventListener('dragleave', (e) => {
                if (listHeader.contains(e.relatedTarget)) return;
                listHeader.classList.remove('todo-list-drag-over');
            });
            listHeader.addEventListener('drop', (e) => {
                listHeader.classList.remove('todo-list-drag-over');
                if (_todoDragItemId) {
                    e.preventDefault();
                    e.stopPropagation();
                    moveTodoItem(_todoDragItemId, list.id);
                    _todoDragItemId = null;
                    _todoDragListId = null;
                }
            });
        }

        // List element: accept list-reorder drops
        listEl.addEventListener('dragover', (e) => {
            if (!_todoDragListElemId || _todoDragListElemId === list.id) return;
            if (_todoDragItemId) return;
            e.preventDefault();
            const rect = listEl.getBoundingClientRect();
            const before = e.clientY < rect.top + rect.height / 2;
            listEl.classList.toggle('todo-list-drop-before', before);
            listEl.classList.toggle('todo-list-drop-after', !before);
        });
        listEl.addEventListener('dragleave', (e) => {
            if (listEl.contains(e.relatedTarget)) return;
            listEl.classList.remove('todo-list-drop-before', 'todo-list-drop-after');
        });
        listEl.addEventListener('drop', (e) => {
            listEl.classList.remove('todo-list-drop-before', 'todo-list-drop-after');
            if (!_todoDragListElemId || _todoDragListElemId === list.id) return;
            if (_todoDragItemId) return;
            e.preventDefault();
            const rect = listEl.getBoundingClientRect();
            const before = e.clientY < rect.top + rect.height / 2;
            _reorderTodoList(_todoDragListElemId, list.id, before);
        });

        listEl.appendChild(listHeader);

        // Items container (only for active list)
        if (isActive) {
            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'todo-items';
            itemsContainer.id = `todo-items-${list.id}`;
            _renderTodoItems(list, itemsContainer);
            listEl.appendChild(itemsContainer);
        }

        container.appendChild(listEl);
    });
}

function _renderTodoItems(list, container) {
    container.innerHTML = '';

    const activeItems = getOrderedActiveItems(list);
    const doneItems = [...(list.items || []).filter(i => i.isDone)]
        .sort((a, b) => {
            if (!a.doneAt && !b.doneAt) return 0;
            if (!a.doneAt) return 1;
            if (!b.doneAt) return -1;
            return new Date(b.doneAt) - new Date(a.doneAt);
        });

    if (!activeItems.length) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'todo-items-empty';
        emptyEl.textContent = 'No items yet — add one with ⤒+ or ⤓+';
        container.appendChild(emptyEl);
    } else {
        activeItems.forEach(item => {
            container.appendChild(_makeTodoItemRow(item, list.id));
        });
    }

    // Done section
    if (doneItems.length) {
        const doneSection = document.createElement('div');
        doneSection.className = 'todo-done-section';

        const isExpanded = doneExpandedListId === list.id;
        const doneHeader = document.createElement('div');
        doneHeader.className = 'todo-done-header';
        doneHeader.innerHTML = `<span class="todo-done-chevron">${isExpanded ? '▼' : '▶'}</span> Done (${doneItems.length})`;
        doneHeader.onclick = () => {
            doneExpandedListId = isExpanded ? null : list.id;
            renderTodoPanel(_getTodoContainer());
        };
        doneSection.appendChild(doneHeader);

        if (isExpanded) {
            const doneItemsEl = document.createElement('div');
            doneItemsEl.className = 'todo-done-items';
            _groupDoneItemsByWeek(doneItems).forEach(group => {
                const weekHeader = document.createElement('div');
                weekHeader.className = 'todo-done-week-header';
                weekHeader.textContent = group.label;
                doneItemsEl.appendChild(weekHeader);
                group.items.forEach(item => {
                    doneItemsEl.appendChild(_makeTodoItemRow(item, list.id));
                });
            });
            doneSection.appendChild(doneItemsEl);
        }

        container.appendChild(doneSection);
    }
}

function _makeTodoItemRow(item, listId) {
    const row = document.createElement('div');
    const isExpanded = expandedItemId === item.id;
    row.className = 'todo-item'
        + (item.isDone ? ' done' : '')
        + (isExpanded ? ' inline-expanded' : '');
    row.dataset.itemId = item.id;

    const firstLine = getFirstLine(item.content);
    const hasImages = item.content && item.content.includes('/uploads/');

    // Drag handle — always visible, activates draggable on mousedown
    const dragHandle = document.createElement('span');
    dragHandle.className = 'todo-item-drag-handle';
    dragHandle.textContent = '⠿';
    dragHandle.title = 'Drag to reorder';
    dragHandle.addEventListener('mousedown', () => { row.draggable = true; });
    dragHandle.addEventListener('touchstart', () => { row.draggable = true; }, { passive: true });

    // Checkbox
    const check = document.createElement('button');
    check.className = 'todo-item-check';
    check.title = item.isDone ? 'Mark as active' : 'Mark as done';
    check.textContent = item.isDone ? ICONS.check : ICONS.uncheck;
    check.onclick = (e) => { e.stopPropagation(); toggleTodoDone(item.id); };

    // First-line: editable input when expanded, plain span when collapsed
    let titleEl;
    if (isExpanded) {
        titleEl = document.createElement('input');
        titleEl.type = 'text';
        titleEl.className = 'todo-item-first-line todo-item-first-line-edit';
        titleEl.value = _getRawFirstLine(item.content);
        titleEl.placeholder = '(empty)';
        titleEl.onclick = (e) => e.stopPropagation();
        const _commitEdit = () => {
            const newContent = _replaceFirstLine(item.content, titleEl.value.trim());
            if (newContent !== item.content) saveTodoItem(item.id, newContent);
        };
        titleEl.onblur = _commitEdit;
        titleEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                _commitEdit();
                expandedItemId = null;
                renderTodoPanel(_getTodoContainer());
            } else if (e.key === 'Escape') {
                e.stopPropagation();
                expandedItemId = null;
                renderTodoPanel(_getTodoContainer());
            }
        };
    } else {
        titleEl = document.createElement('span');
        titleEl.className = 'todo-item-first-line';
        if (firstLine) {
            titleEl.textContent = firstLine;
        } else if (hasImages) {
            titleEl.textContent = '(image)';
            titleEl.classList.add('todo-item-image-fallback');
        } else {
            titleEl.textContent = '(empty)';
            titleEl.classList.add('todo-item-empty-fallback');
        }
        titleEl.onclick = (e) => {
            e.stopPropagation();
            expandedItemId = item.id;
            renderTodoPanel(_getTodoContainer());
        };
    }

    // Actions
    const actions = document.createElement('div');
    actions.className = 'todo-item-actions';
    actions.innerHTML = `
        <button class="btn-icon todo-item-pos-btn" title="Move to top" onclick="moveTodoItemToPosition('${item.id}','${listId}','top')">${ICONS.moveTop}</button>
        <button class="btn-icon todo-item-pos-btn" title="Move to bottom" onclick="moveTodoItemToPosition('${item.id}','${listId}','bottom')">${ICONS.moveBottom}</button>
        <button class="btn-icon danger" title="Delete" onclick="deleteTodoItem('${item.id}')">${ICONS.delete}</button>
        <button class="btn-icon" title="Edit" onclick="openItemEditor('${item.id}')">${ICONS.edit}</button>
        <button class="btn-icon todo-move-list-btn" title="Move to another list" onclick="openTodoMoveModal('${item.id}')">⋯</button>
    `;

    row.appendChild(dragHandle);
    row.appendChild(check);
    row.appendChild(titleEl);
    if (hasImages) {
        const badge = document.createElement('span');
        badge.className = 'todo-image-badge';
        badge.title = 'Contains images';
        badge.textContent = '🖼';
        row.appendChild(badge);
    }
    row.appendChild(actions);

    // Item drag events
    row.addEventListener('dragstart', (e) => {
        _todoDragItemId = item.id;
        _todoDragListId = listId;
        e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation();
        row.classList.add('todo-dragging');
    });
    row.addEventListener('dragend', () => {
        row.draggable = false;
        row.classList.remove('todo-dragging');
        _clearTodoDragIndicators();
        _todoDragItemId = null;
        _todoDragListId = null;
    });
    row.addEventListener('dragover', (e) => {
        if (!_todoDragItemId || _todoDragItemId === item.id) return;
        if (_todoDragListId !== listId) return; // cross-list handled by list header
        e.preventDefault();
        e.stopPropagation();
        const rect = row.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        row.classList.toggle('todo-drop-before', before);
        row.classList.toggle('todo-drop-after', !before);
    });
    row.addEventListener('dragleave', (e) => {
        if (row.contains(e.relatedTarget)) return;
        row.classList.remove('todo-drop-before', 'todo-drop-after');
    });
    row.addEventListener('drop', (e) => {
        row.classList.remove('todo-drop-before', 'todo-drop-after');
        if (!_todoDragItemId || _todoDragItemId === item.id) return;
        if (_todoDragListId !== listId) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = row.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        _reorderTodoItem(_todoDragItemId, listId, item.id, before);
    });

    // Inline expanded content
    if (isExpanded) {
        const inlineContent = document.createElement('div');
        inlineContent.className = 'todo-item-inline-content';

        if (window.marked) {
            inlineContent.innerHTML = window.marked.parse(item.content || '');
        } else {
            const pre = document.createElement('pre');
            pre.className = 'todo-item-pre';
            pre.textContent = item.content || '';
            inlineContent.appendChild(pre);
        }

        // Timestamps
        const timestamps = document.createElement('div');
        timestamps.className = 'todo-item-timestamps';
        if (item.createdAt) {
            const s = document.createElement('span');
            s.textContent = 'Created: ' + new Date(item.createdAt).toLocaleString();
            timestamps.appendChild(s);
        }
        if (item.updatedAt && item.updatedAt !== item.createdAt) {
            const s = document.createElement('span');
            s.textContent = 'Updated: ' + new Date(item.updatedAt).toLocaleString();
            timestamps.appendChild(s);
        }
        if (item.doneAt) {
            const s = document.createElement('span');
            s.textContent = 'Done: ' + new Date(item.doneAt).toLocaleString();
            timestamps.appendChild(s);
        }
        if (timestamps.children.length) inlineContent.appendChild(timestamps);

        row.appendChild(inlineContent);
    }

    if (isExpanded) {
        setTimeout(() => {
            const inp = row.querySelector('.todo-item-first-line-edit');
            if (inp) inp.focus();
        }, 0);
    }

    return row;
}
