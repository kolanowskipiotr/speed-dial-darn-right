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
