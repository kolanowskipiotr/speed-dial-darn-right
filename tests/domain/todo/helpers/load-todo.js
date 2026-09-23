// Loads the real browser todo scripts (helpers, crud, drag) and the real client
// restore code (sync-backup.js) into vm contexts with a minimal DOM stub.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../../../..');
const TODO_SCRIPTS = ['domain/core/utils.js', 'domain/todo/helpers.js', 'domain/todo/crud.js', 'domain/todo/drag.js'];

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function makeElement(tag) {
    const listeners = {};
    return {
        tag,
        value: '',
        style: {},
        isConnected: true,
        className: '',
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
        dispatch(type, event = {}) {
            (listeners[type] || []).forEach(fn => fn({ preventDefault() {}, stopPropagation() {}, ...event }));
        },
        appendChild() {},
        insertBefore() {},
        querySelector() { return null; },
        remove() {},
        focus() {},
    };
}

function loadScripts(ctx, files) {
    vm.createContext(ctx);
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
    }
    return ctx;
}

/**
 * Harness around the real todo CRUD code. `ops` drive user actions the same way the UI does.
 */
function createTodoHarness(initialData) {
    let lastInput = null;
    const listNameInput = makeElement('input');

    let seq = 0;
    const stubs = {
        // Deterministic ids: the real uid() has only 5 random chars, so thousands of ids
        // created within one millisecond (as in these tests) could collide
        uid: () => `t${String(++seq).padStart(6, '0')}`,
        ICONS: new Proxy({}, { get: () => '' }),
        saveData() {},
        render() {},
        renderTodoPanel() {},
        _getTodoContainer: () => null,
        showToast() {},
        showToastUndo() {},
        showConfirm: (title, msg, onConfirm) => onConfirm(),
        openModal() {},
        closeModal() {},
        deleteDialImage: async () => {},
        document: {
            getElementById(id) {
                if (id === 'todoListName') return listNameInput;
                if (id.startsWith('todo-items-')) return makeElement('div');
                return null;
            },
            querySelector: () => null,
            createElement(tag) {
                const el = makeElement(tag);
                if (tag === 'input') lastInput = el;
                return el;
            },
        },
    };
    const ctx = {
        console,
        setTimeout: fn => fn(),
        data: clone(initialData),
        currentTodoListEmoji: '✅',
        activeTodoListId: null,
        editingTodoListId: null,
    };

    // utils.js is the real one; stubs then replace uid() and its DOM helpers
    loadScripts(ctx, TODO_SCRIPTS);
    const realUid = ctx.uid;
    Object.assign(ctx, stubs);
    const run = code => vm.runInContext(code, ctx);

    const ops = {
        addItem(listId, content, position = 'bottom') {
            ctx.addTodoItem(listId, position);
            lastInput.value = content;
            lastInput.dispatch('keydown', { key: 'Enter', shiftKey: false });
            const list = ctx.findTodoList(listId);
            return list.items[list.items.length - 1].id;
        },
        editItem: (id, content) => ctx.saveTodoItem(id, content),
        toggleDone: id => ctx.toggleTodoDone(id),
        deleteItem: id => ctx.deleteTodoItem(id),
        moveToPosition: (id, listId, position) => ctx.moveTodoItemToPosition(id, listId, position),
        moveToList: (id, targetListId) => ctx.moveTodoItem(id, targetListId),
        reorderItem: (dragId, listId, targetId, before) => ctx._reorderTodoItem(dragId, listId, targetId, before),
        reorderList: (dragId, targetId, before) => ctx._reorderTodoList(dragId, targetId, before),
        createList(name) {
            run('editingTodoListId = null');
            listNameInput.value = name;
            ctx.saveTodoList();
            return ctx.data.todoLists[ctx.data.todoLists.length - 1].id;
        },
        renameList(id, name) {
            run(`editingTodoListId = ${JSON.stringify(id)}`);
            listNameInput.value = name;
            ctx.saveTodoList();
        },
        deleteList(id) {
            run(`editingTodoListId = ${JSON.stringify(id)}`);
            ctx.deleteTodoListFromModal();
        },
    };

    return {
        ctx,
        ops,
        run,
        realUid,
        // Values are cloned out of the vm realm so deepStrictEqual compares plain host objects
        get data() { return clone(ctx.data); },
        normalize: () => ctx.normalizeTodoOrder(),
        orderedListIds: () => clone(ctx.getOrderedTodoLists().map(l => l.id)),
        orderedActiveIds: listId => clone(ctx.getOrderedActiveItems(ctx.findTodoList(listId)).map(i => i.id)),
    };
}

/** Real client-side applyDiff from domain/persistence/sync-backup.js */
function loadClientApplyDiff() {
    const ctx = loadScripts({ console }, ['domain/persistence/sync-backup.js']);
    return ctx.applyDiff;
}

module.exports = { createTodoHarness, loadClientApplyDiff, clone };
