const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const TASKS_SYNC_PATH = path.resolve(__dirname, '../../../../../domain/note/tasks-sync.js');
const TASKS_API_PREFIX = '/tasks/v1';

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function makeResponse(status, body) {
    const hasJsonBody = body !== undefined && body !== null && typeof body !== 'string';
    const textBody = typeof body === 'string' ? body : JSON.stringify(body || {});

    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            if (typeof body === 'string') return JSON.parse(body || '{}');
            return body || {};
        },
        async text() {
            return hasJsonBody ? textBody : (body || '');
        },
    };
}

function createTestNote(overrides = {}) {
    return {
        id: 'note-1',
        name: 'Test Note',
        content: '',
        language: 'markdown',
        order: 0,
        createdAt: '2026-04-11T09:00:00.000Z',
        updatedAt: '2026-04-11T09:00:00.000Z',
        taskSync: true,
        taskIds: [],
        taskLastSyncedAt: null,
        taskLocalDirty: false,
        taskConflict: false,
        ...overrides,
    };
}

function createTasksSyncHarness(options = {}) {
    const {
        notes = [createTestNote()],
        currentAccessToken = 'test-access-token',
        tasksNotesListId = null,
        handleRequest = async () => ({ status: 200, body: {} }),
    } = options;

    const requests = [];
    const toasts = [];
    const saveSnapshots = [];
    const handleSyncErrors = [];
    const closedModals = [];
    const notesCMValues = [];
    const listeners = {};
    const timers = new Map();
    let nextTimerId = 1;
    let refreshCount = 0;
    let renderCount = 0;
    let saveSyncSettingsCount = 0;
    let addNoteCount = 0;

    const scrollArea = { id: 'notes-tabs-scroll-area' };

    let context;
    function findNote(id) {
        return (context.data.notes || []).find(note => note.id === id) || null;
    }

    context = {
        console,
        Date,
        JSON,
        Promise,
        Set,
        URL,
        data: { notes: clone(notes) },
        activeNoteId: notes[0]?.id || null,
        currentAccessToken,
        tasksNotesListId,
        ICONS: {
            warn: '[warn]',
            error: '[error]',
            info: '[info]',
            ok: '[ok]',
        },
        document: {
            querySelector(selector) {
                if (selector === '.notes-tabs-scroll-area') return scrollArea;
                return null;
            },
            getElementById() {
                return null;
            },
        },
        showToast(message) {
            toasts.push(message);
        },
        saveData() {
            saveSnapshots.push(clone(context.data));
        },
        saveSyncSettings() {
            saveSyncSettingsCount += 1;
        },
        findNote,
        handleSyncError(error) {
            handleSyncErrors.push(error.message);
            return true;
        },
        _buildNotesTabs(element) {
            if (element === scrollArea) refreshCount += 1;
        },
        renderNotesPanel() {
            renderCount += 1;
        },
        _getNotesContainer() {
            return { id: 'notes-container' };
        },
        closeModal(id) {
            closedModals.push(id);
        },
        addNote(name) {
            addNoteCount += 1;
            const note = createTestNote({
                id: `imported-note-${addNoteCount}`,
                name: name || 'Imported Note',
                order: context.data.notes.length,
                taskSync: false,
            });
            context.data.notes.push(note);
            context.activeNoteId = note.id;
        },
        setTimeout(callback, delay) {
            const id = nextTimerId++;
            timers.set(id, { callback, delay });
            return id;
        },
        clearTimeout(id) {
            timers.delete(id);
        },
        async fetch(url, options = {}) {
            const parsed = new URL(url);
            const method = (options.method || 'GET').toUpperCase();
            const pathName = parsed.pathname.replace(new RegExp(`^${TASKS_API_PREFIX}`), '') || '/';
            const endpoint = `${pathName}${parsed.search}`;
            const bodyText = options.body ?? null;
            let jsonBody = null;
            if (typeof bodyText === 'string' && bodyText) {
                jsonBody = JSON.parse(bodyText);
            }

            const request = {
                url,
                endpoint,
                method,
                headers: options.headers || {},
                bodyText,
                jsonBody,
            };
            requests.push(request);

            const response = await handleRequest(request, context);
            return makeResponse(response.status, response.body);
        },
        NotesCM: {
            setValue(value) {
                notesCMValues.push(value);
            },
        },
        addEventListener(eventName, listener) {
            listeners[eventName] = listener;
        },
    };

    context.window = context;

    const source = fs.readFileSync(TASKS_SYNC_PATH, 'utf8');
    vm.createContext(context);
    vm.runInContext(source, context, { filename: TASKS_SYNC_PATH });

    return {
        context,
        requests,
        toasts,
        saveSnapshots,
        handleSyncErrors,
        closedModals,
        notesCMValues,
        listeners,
        get refreshCount() {
            return refreshCount;
        },
        get renderCount() {
            return renderCount;
        },
        get saveSyncSettingsCount() {
            return saveSyncSettingsCount;
        },
        getTimerCount() {
            return timers.size;
        },
        runTimer(id) {
            const timer = timers.get(id);
            if (!timer) return false;
            timers.delete(id);
            timer.callback();
            return true;
        },
        runAllTimers() {
            const ids = [...timers.keys()];
            ids.forEach(id => this.runTimer(id));
        },
        getNote(id) {
            return findNote(id);
        },
        getLastNote() {
            return context.data.notes[context.data.notes.length - 1] || null;
        },
    };
}

module.exports = {
    createTasksSyncHarness,
    createTestNote,
};
