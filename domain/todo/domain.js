// ─── TODO MODULE ─────────────────────────────────────────────────
// Loaded after render.js, before init.js.
// All functions are global (no module system).

let todoFullScreen = false;
let doneExpandedListId = null;  // id of list whose Done section is expanded; JS-only, resets on load
let expandedItemId = null;      // id of item shown inline-expanded

// Drag state — all JS-only, no persistence
let _todoDragItemId  = null;  // id of item being dragged
let _todoDragListId  = null;  // source list id for item drag
let _todoDragListElemId = null; // id of list being dragged (list reorder)

// ─── HELPERS ─────────────────────────────────────────────────────

function findTodoList(id) {
    return (data.todoLists || []).find(l => l.id === id) || null;
}

function findTodoItem(itemId) {
    for (const list of data.todoLists || []) {
        const item = (list.items || []).find(i => i.id === itemId);
        if (item) return { item, list };
    }
    return null;
}

function extractUploadIds(content) {
    const re = /\/uploads\/([\w.\-]+)/g;
    const ids = [];
    let m;
    while ((m = re.exec(content)) !== null) ids.push(m[1]);
    return ids;
}

function getFirstLine(content) {
    if (!content) return '';
    const line = content.split('\n').find(l => l.trim()) || '';
    // Strip common markdown markers for a clean preview
    return line
        .replace(/^#+\s+/, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^\s*[-*+]\s+/, '')
        .replace(/^\s*\d+\.\s+/, '')
        .trim();
}

function _getRawFirstLine(content) {
    if (!content) return '';
    return content.split('\n').find(l => l.trim()) || '';
}

function _replaceFirstLine(content, newLine) {
    if (!content) return newLine;
    const lines = content.split('\n');
    const idx = lines.findIndex(l => l.trim());
    if (idx === -1) return newLine;
    lines[idx] = newLine;
    return lines.join('\n');
}

function _getTodoContainer() {
    return document.querySelector('.home-col-todo');
}

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
    const lists = [...(data.todoLists || [])].sort((a, b) => a.order - b.order);

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
                    <button class="btn-icon" title="Edit list" onclick="openTodoListModal('${list.id}')">${ICONS.edit}</button>
                    <button class="btn-icon" title="Add to top" onclick="addTodoItem('${list.id}','top')">⤒+</button>
                    <button class="btn-icon" title="Add to bottom" onclick="addTodoItem('${list.id}','bottom')">⤓+</button>
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

    const activeItems = [...(list.items || []).filter(i => !i.isDone)]
        .sort((a, b) => a.order - b.order);
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
            doneItems.forEach(item => {
                doneItemsEl.appendChild(_makeTodoItemRow(item, list.id));
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
        <button class="btn-icon" title="Edit" onclick="openItemEditor('${item.id}')">${ICONS.edit}</button>
        <button class="btn-icon todo-item-pos-btn" title="Move to top" onclick="moveTodoItemToPosition('${item.id}','${listId}','top')">${ICONS.moveTop}</button>
        <button class="btn-icon todo-item-pos-btn" title="Move to bottom" onclick="moveTodoItemToPosition('${item.id}','${listId}','bottom')">${ICONS.moveBottom}</button>
        <button class="btn-icon danger" title="Delete" onclick="deleteTodoItem('${item.id}')">${ICONS.delete}</button>
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

// ─── LIST CRUD ────────────────────────────────────────────────────

function openTodoListModal(listId) {
    editingTodoListId = listId;

    const nameInput = document.getElementById('todoListName');
    const titleEl = document.getElementById('todoListModalTitle');
    const emojiPreview = document.getElementById('todoListEmojiPreview');
    const deleteBtn = document.getElementById('btnDeleteTodoList');

    if (listId) {
        const list = findTodoList(listId);
        if (!list) return;
        titleEl.textContent = 'Edit List';
        nameInput.value = list.name;
        currentTodoListEmoji = list.emoji || ICONS.defaultTodoList;
        emojiPreview.textContent = currentTodoListEmoji;
        deleteBtn.style.display = '';
    } else {
        titleEl.textContent = 'New List';
        nameInput.value = '';
        currentTodoListEmoji = ICONS.defaultTodoList;
        emojiPreview.textContent = currentTodoListEmoji;
        deleteBtn.style.display = 'none';
    }

    openModal('todoListModal');
    setTimeout(() => nameInput.focus(), 50);
}

function closeTodoListModal() {
    closeModal('todoListModal');
    const picker = document.getElementById('todoListEmojiPicker');
    if (picker) picker.classList.remove('open');
}

function saveTodoList() {
    const name = document.getElementById('todoListName').value.trim();
    if (!name) {
        const input = document.getElementById('todoListName');
        input.focus();
        input.style.borderColor = 'var(--danger)';
        setTimeout(() => input.style.borderColor = '', 1000);
        return;
    }

    const now = new Date().toISOString();

    if (editingTodoListId) {
        const list = findTodoList(editingTodoListId);
        if (!list) return;
        list.name = name;
        list.emoji = currentTodoListEmoji;
    } else {
        const maxOrder = data.todoLists.length
            ? Math.max(...data.todoLists.map(l => l.order))
            : -1;
        data.todoLists.push({
            id: uid(),
            name,
            emoji: currentTodoListEmoji,
            createdAt: now,
            order: maxOrder + 1,
            items: [],
        });
    }

    saveData();
    closeTodoListModal();
    render();
}

function deleteTodoListFromModal() {
    if (!editingTodoListId) return;
    const list = findTodoList(editingTodoListId);
    if (!list) return;

    const itemCount = (list.items || []).length;
    showConfirm(
        'Delete List',
        `Delete "${list.name}" and its ${itemCount} item${itemCount !== 1 ? 's' : ''}?`,
        () => {
            const _listImgIds = (list.items || []).flatMap(item => extractUploadIds(item.content || ''));
            if (_listImgIds.length) {
                Promise.all(_listImgIds.map(id => deleteDialImage(id))).then(() => {
                    showToast(`${ICONS.delete} ${_listImgIds.length} image${_listImgIds.length > 1 ? 's' : ''} removed from storage`);
                }).catch(() => {});
            }
            data.todoLists = data.todoLists.filter(l => l.id !== editingTodoListId);
            if (activeTodoListId === editingTodoListId) {
                activeTodoListId = data.todoLists.length ? data.todoLists[0].id : null;
            }
            saveData();
            closeTodoListModal();
            render();
        }
    );
}

// ─── ITEM ADD ────────────────────────────────────────────────────

function addTodoItem(listId, position) {
    const list = findTodoList(listId);
    if (!list) return;

    const container = document.getElementById(`todo-items-${listId}`);
    if (!container) return;

    // Remove any existing inline input
    const existing = container.querySelector('.todo-item-add-input');
    if (existing) existing.remove();

    const inputRow = document.createElement('div');
    inputRow.className = 'todo-item-add-input';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'todo-add-inline-input';
    input.placeholder = 'New item…';
    inputRow.appendChild(input);

    let _handled = false; // prevent blur handler from double-firing after keydown

    const commit = () => {
        const content = input.value.trim();
        if (!content) {
            inputRow.classList.add('shake');
            setTimeout(() => inputRow.classList.remove('shake'), 400);
            setTimeout(() => input.focus(), 20);
            return;
        }

        const now = new Date().toISOString();
        const activeItems = list.items.filter(i => !i.isDone);

        let order;
        if (position === 'top') {
            order = activeItems.length
                ? Math.min(...activeItems.map(i => i.order)) - 1
                : 0;
        } else {
            order = activeItems.length
                ? Math.max(...activeItems.map(i => i.order)) + 1
                : 0;
        }

        list.items.push({
            id: uid(),
            content,
            isDone: false,
            createdAt: now,
            updatedAt: now,
            doneAt: null,
            order,
        });

        _handled = true;
        saveData();
        renderTodoPanel(_getTodoContainer());
    };

    const cancelInput = (askConfirm) => {
        _handled = true;
        if (askConfirm && input.value.trim()) {
            showConfirm('Discard new item?', 'Discard this new item?', () => {
                renderTodoPanel(_getTodoContainer());
            }, { btnLabel: 'Discard', danger: false });
        } else {
            renderTodoPanel(_getTodoContainer());
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelInput(true);
        }
    });
    // On blur: commit if content exists, silently cancel if empty
    input.addEventListener('blur', () => {
        if (_handled) return;
        setTimeout(() => {
            if (!_handled && inputRow.isConnected) {
                const content = input.value.trim();
                if (content) {
                    commit();
                } else {
                    cancelInput(false);
                }
            }
        }, 120);
    });

    if (position === 'top') {
        // Insert before the first .todo-item or at the top
        const firstItem = container.querySelector('.todo-item, .todo-items-empty');
        if (firstItem) {
            container.insertBefore(inputRow, firstItem);
        } else {
            container.insertBefore(inputRow, container.firstChild);
        }
    } else {
        // Insert before done section if present, else append
        const doneSection = container.querySelector('.todo-done-section');
        if (doneSection) {
            container.insertBefore(inputRow, doneSection);
        } else {
            container.appendChild(inputRow);
        }
    }

    input.focus();
}

// ─── ITEM CRUD ────────────────────────────────────────────────────

function saveTodoItem(id, content) {
    const result = findTodoItem(id);
    if (!result) return;
    const oldIds = extractUploadIds(result.item.content || '');
    result.item.content = content;
    result.item.updatedAt = new Date().toISOString();
    saveData();
    const newIds = new Set(extractUploadIds(content));
    const removed = oldIds.filter(imgId => !newIds.has(imgId));
    if (removed.length) {
        Promise.all(removed.map(imgId => deleteDialImage(imgId))).then(() => {
            showToast(`${ICONS.delete} ${removed.length} image${removed.length > 1 ? 's' : ''} removed from storage`);
        }).catch(() => {});
    }
}

function toggleTodoDone(id) {
    const result = findTodoItem(id);
    if (!result) return;
    const { item } = result;
    const now = new Date().toISOString();
    item.isDone = !item.isDone;
    item.doneAt = item.isDone ? now : null;
    item.updatedAt = now;
    // If we're expanding this item, collapse it when marking done
    if (item.isDone && expandedItemId === id) expandedItemId = null;
    saveData();
    renderTodoPanel(_getTodoContainer());
}

function deleteTodoItem(id) {
    const result = findTodoItem(id);
    if (!result) return;
    const { item, list } = result;

    // Save full data for undo (before deletion)
    const backup = JSON.stringify(data);

    // Clean up uploads
    const _itemImgIds = extractUploadIds(item.content || '');
    if (_itemImgIds.length) {
        Promise.all(_itemImgIds.map(imgId => deleteDialImage(imgId))).then(() => {
            showToast(`${ICONS.delete} ${_itemImgIds.length} image${_itemImgIds.length > 1 ? 's' : ''} removed from storage`);
        }).catch(() => {});
    }

    list.items = list.items.filter(i => i.id !== id);
    if (expandedItemId === id) expandedItemId = null;

    saveData();
    renderTodoPanel(_getTodoContainer());
    showToastUndo(`${ICONS.delete} Item deleted`, backup);
}

function moveTodoItemToPosition(id, listId, position) {
    const list = findTodoList(listId);
    if (!list) return;
    const result = findTodoItem(id);
    if (!result) return;
    const { item } = result;

    const activeItems = list.items.filter(i => !i.isDone && i.id !== id);

    if (position === 'top') {
        item.order = activeItems.length
            ? Math.min(...activeItems.map(i => i.order)) - 1
            : 0;
    } else {
        item.order = activeItems.length
            ? Math.max(...activeItems.map(i => i.order)) + 1
            : 0;
    }

    saveData();
    renderTodoPanel(_getTodoContainer());
}

// ─── MOVE BETWEEN LISTS ───────────────────────────────────────────

let _movingItemId = null;

function openTodoMoveModal(itemId) {
    _movingItemId = itemId;
    const result = findTodoItem(itemId);
    if (!result) return;
    const { list: sourceList } = result;

    const optionsEl = document.getElementById('todoMoveListOptions');
    optionsEl.innerHTML = '';

    const otherLists = (data.todoLists || [])
        .filter(l => l.id !== sourceList.id)
        .sort((a, b) => a.order - b.order);

    if (!otherLists.length) {
        optionsEl.innerHTML = '<p style="color:var(--text-dim);font-size:13px;padding:8px 0">No other lists available</p>';
    } else {
        otherLists.forEach(list => {
            const btn = document.createElement('button');
            btn.className = 'todo-move-list-option';
            if (list.emoji) {
                const em = document.createElement('span');
                em.textContent = list.emoji;
                btn.appendChild(em);
            }
            const nm = document.createElement('span');
            nm.textContent = list.name;
            btn.appendChild(nm);
            btn.onclick = () => moveTodoItem(itemId, list.id);
            optionsEl.appendChild(btn);
        });
    }

    openModal('todoMoveModal');
}

function closeTodoMoveModal() {
    closeModal('todoMoveModal');
    _movingItemId = null;
}

function moveTodoItem(id, targetListId) {
    const result = findTodoItem(id);
    if (!result) return;
    const { item, list: sourceList } = result;

    const targetList = findTodoList(targetListId);
    if (!targetList) return;

    // Remove from source
    sourceList.items = sourceList.items.filter(i => i.id !== id);

    // Add to top of target
    const minOrder = targetList.items.length
        ? Math.min(...targetList.items.map(i => i.order)) - 1
        : 0;
    item.order = minOrder;
    targetList.items.push(item);

    activeTodoListId = targetListId;

    saveData();
    closeTodoMoveModal();
    renderTodoPanel(_getTodoContainer());
}

// ─── ITEM EDITOR — CodeMirror 6 + marked.js live preview ─────────

function openItemEditor(id) {
    const result = findTodoItem(id);
    if (!result) return;
    expandedItemId = null;
    editingTodoItemId = id;
    renderTodoPanel(_getTodoContainer());
}

function _renderItemEditor(container) {
    const result = findTodoItem(editingTodoItemId);
    if (!result) {
        editingTodoItemId = null;
        renderTodoPanel(container);
        return;
    }
    const { item } = result;

    // Destroy previous CM instance before clearing DOM
    if (window.TodoCM) TodoCM.destroy();
    container.innerHTML = '';
    const editorView = document.createElement('div');
    editorView.className = 'todo-edit-view';

    // Header row
    const editorHeader = document.createElement('div');
    editorHeader.className = 'todo-edit-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn-icon todo-edit-back';
    backBtn.textContent = ICONS.back;
    backBtn.onclick = () => closeItemEditor();

    const timestamps = document.createElement('div');
    timestamps.className = 'todo-edit-timestamps';
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

    const fsBtn = document.createElement('button');
    fsBtn.className = 'btn-icon todo-fullscreen-btn';
    fsBtn.title = 'Toggle full screen';
    fsBtn.textContent = todoFullScreen ? '⛶' : '⤢';
    fsBtn.onclick = () => toggleTodoFullScreen();

    editorHeader.appendChild(backBtn);
    editorHeader.appendChild(timestamps);
    editorHeader.appendChild(fsBtn);
    editorView.appendChild(editorHeader);

    // Split body: CM6 editor (top/left) + marked.js preview (bottom/right)
    const splitBody = document.createElement('div');
    splitBody.className = 'todo-edit-split';

    const cmHost = document.createElement('div');
    cmHost.className = 'todo-edit-cm-host';
    splitBody.appendChild(cmHost);

    // Draggable divider
    const divider = document.createElement('div');
    divider.className = 'todo-edit-divider';
    splitBody.appendChild(divider);

    const preview = document.createElement('div');
    preview.className = 'todo-edit-preview todo-item-inline-content';
    splitBody.appendChild(preview);

    editorView.appendChild(splitBody);

    // Divider drag-to-resize
    divider.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const isRow = document.body.classList.contains('todo-fullscreen');
        const startPos = isRow ? e.clientX : e.clientY;
        const rect = splitBody.getBoundingClientRect();
        const splitSize = isRow ? rect.width : rect.height;
        const startSize = isRow ? cmHost.getBoundingClientRect().width : cmHost.getBoundingClientRect().height;
        divider.classList.add('dragging');

        const onMove = (ev) => {
            const delta = (isRow ? ev.clientX : ev.clientY) - startPos;
            const newSize = Math.max(80, Math.min(startSize + delta, splitSize - 80));
            cmHost.style.flex = `0 0 ${newSize}px`;
        };
        const onUp = () => {
            divider.classList.remove('dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
    container.appendChild(editorView);

    const _isDark = !document.body.dataset.theme?.startsWith('light');
    if (window.TodoCM) {
        TodoCM.mount(cmHost, item.content || '', _isDark, {
            onChange: (text) => {
                preview.innerHTML = typeof marked !== 'undefined'
                    ? marked.parse(text) : escHtml(text);
            },
            onPaste: (e) => _handleTodoImagePaste(e),
            onDrop:  (e) => _handleTodoImageDrop(e),
            onEsc:   () => closeItemEditor(),
        });
        // initial preview
        preview.innerHTML = typeof marked !== 'undefined'
            ? marked.parse(item.content || '')
            : escHtml(item.content || '');
    } else {
        // Fallback — plain textarea
        const ta = document.createElement('textarea');
        ta.className = 'todo-edit-textarea';
        ta.value = item.content || '';
        ta.addEventListener('input', () => {
            preview.innerHTML = typeof marked !== 'undefined'
                ? marked.parse(ta.value) : escHtml(ta.value);
        });
        ta.addEventListener('paste', _handleTodoImagePaste, { capture: true });
        ta.addEventListener('drop',  _handleTodoImageDrop,  { capture: true });
        cmHost.appendChild(ta);
        ta.focus();
        preview.innerHTML = typeof marked !== 'undefined'
            ? marked.parse(item.content || '') : escHtml(item.content || '');
    }
}

function closeItemEditor() {
    if (!editingTodoItemId) return;

    const content = window.TodoCM ? TodoCM.getValue()
        : (document.querySelector('.todo-edit-textarea')?.value ?? '');
    if (window.TodoCM) TodoCM.destroy();

    const trimmed = (content || '').trim();

    if (!trimmed) {
        // If the item already had content, the editor may have failed to load (returned empty).
        // In that case, keep the existing content rather than falsely deleting.
        const existingResult = findTodoItem(editingTodoItemId);
        const originalContent = existingResult?.item?.content?.trim() || '';
        if (originalContent) {
            editingTodoItemId = null;
            renderTodoPanel(_getTodoContainer());
            return;
        }
        showConfirm(
            'Empty item',
            'Item is empty — delete it or keep editing?',
            () => {
                const result = findTodoItem(editingTodoItemId);
                if (result) {
                    result.list.items = result.list.items.filter(i => i.id !== editingTodoItemId);
                    saveData();
                }
                editingTodoItemId = null;
                renderTodoPanel(_getTodoContainer());
            },
            { btnLabel: 'Delete', danger: true }
        );
        return;
    }

    saveTodoItem(editingTodoItemId, trimmed);
    editingTodoItemId = null;
    renderTodoPanel(_getTodoContainer());
}

// ─── IMAGE PASTE/DROP IN EDITOR ──────────────────────────────────

async function _handleTodoImagePaste(e) {
    const items = [...(e.clipboardData?.items || [])];
    const imageItem = items.find(i => i.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    e.stopPropagation();
    await _uploadTodoImage(imageItem.getAsFile());
}

async function _handleTodoImageDrop(e) {
    const files = [...(e.dataTransfer?.files || [])];
    const imageFile = files.find(f => f.type.startsWith('image/'));
    if (!imageFile) return;
    e.preventDefault();
    e.stopPropagation();
    await _uploadTodoImage(imageFile);
}

async function _uploadTodoImage(file) {
    if (!file) return;
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const id = uid() + '.' + ext;
    try {
        showToast(`${ICONS.loading} Uploading image…`);
        await uploadDialImage(id, file);  // POST /api/upload/<id.ext>
        const mdRef = `![image](/uploads/${id})`;
        if (window.TodoCM && editingTodoItemId) {
            TodoCM.insertAtCursor(mdRef);
        } else {
            const ta = document.querySelector('.todo-edit-textarea');
            if (ta) {
                const start = ta.selectionStart;
                ta.value = ta.value.slice(0, start) + mdRef + ta.value.slice(ta.selectionEnd);
                ta.selectionStart = ta.selectionEnd = start + mdRef.length;
                ta.dispatchEvent(new Event('input'));
            }
        }
        showToast(`${ICONS.ok} Image uploaded`);
    } catch (err) {
        showToast(`${ICONS.error} Image upload failed`);
        console.error('[todo] image upload error:', err);
    }
}

// ─── FULL-SCREEN ─────────────────────────────────────────────────

function toggleTodoFullScreen() {
    todoFullScreen = !todoFullScreen;
    document.body.classList.toggle('todo-fullscreen', todoFullScreen);
    const btn = document.querySelector('.todo-fullscreen-btn');
    if (btn) btn.textContent = todoFullScreen ? '⛶' : '⤢';
}

function exitTodoFullScreen() {
    if (!todoFullScreen) return;
    todoFullScreen = false;
    document.body.classList.remove('todo-fullscreen');
    const btn = document.querySelector('.todo-fullscreen-btn');
    if (btn) btn.textContent = '⤢';
}

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
