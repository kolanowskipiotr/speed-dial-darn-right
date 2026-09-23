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
        const id = uid();
        data.todoLists.push({
            id,
            name,
            emoji: currentTodoListEmoji,
            createdAt: now,
            itemOrder: [],
            items: [],
        });
        data.todoListOrder.push(id);
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
            _removeOrderId(data.todoListOrder, editingTodoListId);
            if (activeTodoListId === editingTodoListId) {
                activeTodoListId = data.todoListOrder[0] || null;
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
        const id = uid();

        list.items.push({
            id,
            content,
            isDone: false,
            createdAt: now,
            updatedAt: now,
            doneAt: null,
        });
        _placeOrderId(list.itemOrder, id, position);

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
    const { item, list } = result;
    const now = new Date().toISOString();
    item.isDone = !item.isDone;
    item.doneAt = item.isDone ? now : null;
    item.updatedAt = now;
    // Done items leave the ordering; a reopened item goes back to the top
    if (item.isDone) _removeOrderId(list.itemOrder, id);
    else _placeOrderId(list.itemOrder, id, 'top');
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
    _removeOrderId(list.itemOrder, id);
    if (expandedItemId === id) expandedItemId = null;

    saveData();
    renderTodoPanel(_getTodoContainer());
    showToastUndo(`${ICONS.delete} Item deleted`, backup);
}

function moveTodoItemToPosition(id, listId, position) {
    const list = findTodoList(listId);
    if (!list) return;
    if (!findTodoItem(id)) return;

    _placeOrderId(list.itemOrder, id, position);

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

    const otherLists = getOrderedTodoLists().filter(l => l.id !== sourceList.id);

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
    _removeOrderId(sourceList.itemOrder, id);

    // Add to top of target (done items stay unordered)
    targetList.items.push(item);
    if (!item.isDone) _placeOrderId(targetList.itemOrder, id, 'top');

    activeTodoListId = targetListId;

    saveData();
    closeTodoMoveModal();
    renderTodoPanel(_getTodoContainer());
}
