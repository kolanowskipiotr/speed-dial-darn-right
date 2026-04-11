const test = require('node:test');
const assert = require('assert');

const {
    createTasksSyncHarness,
    createTestNote,
} = require('./helpers/load-tasks-sync');

test('Google Tasks ↔ notes integration', async (t) => {
    await t.test('push: creates Tasks list, deletes stale parts and uploads chunked note', async () => {
        const longContent = 'A'.repeat(8000) + 'B'.repeat(125);
        const harness = createTasksSyncHarness({
            notes: [createTestNote({
                id: 'note-long',
                name: 'Project Atlas',
                content: longContent,
                taskIds: ['old-task-1', 'old-task-2'],
                taskLocalDirty: true,
            })],
            handleRequest: async (request) => {
                if (request.method === 'GET' && request.endpoint === '/users/@me/lists') {
                    return { status: 200, body: { items: [] } };
                }
                if (request.method === 'POST' && request.endpoint === '/users/@me/lists') {
                    return { status: 200, body: { id: 'list-1', title: 'SDDR - Notes' } };
                }
                if (request.method === 'DELETE' && request.endpoint.startsWith('/lists/list-1/tasks/')) {
                    return { status: 204 };
                }
                if (request.method === 'POST' && request.endpoint === '/lists/list-1/tasks') {
                    const taskNumber = harness.requests.filter(r => r.method === 'POST' && r.endpoint === '/lists/list-1/tasks').length;
                    return {
                        status: 200,
                        body: {
                            id: `task-new-${taskNumber}`,
                            updated: `2026-04-11T12:0${taskNumber}:00.000Z`,
                        },
                    };
                }
                throw new Error(`Unexpected request: ${request.method} ${request.endpoint}`);
            },
        });

        await harness.context.syncNoteToTasks(harness.getNote('note-long'));

        const taskPosts = harness.requests.filter(r => r.method === 'POST' && r.endpoint === '/lists/list-1/tasks');
        assert.strictEqual(taskPosts.length, 2);
        assert.strictEqual(taskPosts[0].jsonBody.title, '[SDDR] Project Atlas (part 1/2)');
        assert.strictEqual(taskPosts[1].jsonBody.title, '[SDDR] Project Atlas (part 2/2)');
        assert.strictEqual(taskPosts[0].jsonBody.notes, `speed-dial:note-long\n${longContent.slice(0, 8000)}`);
        assert.strictEqual(taskPosts[1].jsonBody.notes, `speed-dial:note-long\n${longContent.slice(8000)}`);

        const note = harness.getNote('note-long');
        assert.deepStrictEqual(Array.from(note.taskIds), ['task-new-1', 'task-new-2']);
        assert.strictEqual(note.taskLastSyncedAt, '2026-04-11T12:02:00.000Z');
        assert.strictEqual(note.taskLocalDirty, false);
        assert.strictEqual(note.taskConflict, false);
        assert.strictEqual(harness.context.tasksNotesListId, 'list-1');
        assert.strictEqual(harness.saveSyncSettingsCount, 1);
        assert.strictEqual(harness.saveSnapshots.length, 1);
        assert.strictEqual(harness.context._tasksSyncInFlight.size, 0);
        assert(harness.refreshCount >= 2, 'Notes tabs should refresh before and after sync');
    });

    await t.test('pull: reassembles remote parts, updates note content and active editor', async () => {
        const harness = createTasksSyncHarness({
            tasksNotesListId: 'list-1',
            notes: [createTestNote({
                id: 'note-pull',
                name: 'Weekly Summary',
                content: 'Outdated local content',
                taskIds: ['task-2', 'task-1'],
                taskLastSyncedAt: '2026-04-11T10:00:00.000Z',
            })],
            handleRequest: async (request) => {
                if (request.method === 'GET' && request.endpoint === '/users/@me/lists/list-1') {
                    return { status: 200, body: { id: 'list-1' } };
                }
                if (request.method === 'GET' && request.endpoint === '/lists/list-1/tasks/task-2') {
                    return {
                        status: 200,
                        body: {
                            id: 'task-2',
                            title: '[SDDR] Weekly Summary (part 2/2)',
                            notes: 'speed-dial:note-pull\nWorld',
                            updated: '2026-04-11T12:01:00.000Z',
                        },
                    };
                }
                if (request.method === 'GET' && request.endpoint === '/lists/list-1/tasks/task-1') {
                    return {
                        status: 200,
                        body: {
                            id: 'task-1',
                            title: '[SDDR] Weekly Summary (part 1/2)',
                            notes: 'speed-dial:note-pull\nHello ',
                            updated: '2026-04-11T12:00:00.000Z',
                        },
                    };
                }
                throw new Error(`Unexpected request: ${request.method} ${request.endpoint}`);
            },
        });

        harness.context.activeNoteId = 'note-pull';
        await harness.context.pollNoteFromTasks(harness.getNote('note-pull'));

        const note = harness.getNote('note-pull');
        assert.strictEqual(note.content, 'Hello World');
        assert.strictEqual(note.taskLastSyncedAt, '2026-04-11T12:01:00.000Z');
        assert.strictEqual(note.taskConflict, false);
        assert.strictEqual(harness.saveSnapshots.length, 1);
        assert.deepStrictEqual(harness.notesCMValues, ['Hello World']);
        assert(harness.toasts.some(msg => msg.includes("updated from Google Tasks")));
    });

    await t.test('pull: marks conflict when remote changed and note has unsynced local edits', async () => {
        const harness = createTasksSyncHarness({
            tasksNotesListId: 'list-1',
            notes: [createTestNote({
                id: 'note-conflict',
                name: 'Draft',
                content: 'Local draft changes',
                taskIds: ['task-1'],
                taskLastSyncedAt: '2026-04-11T10:00:00.000Z',
                taskLocalDirty: true,
            })],
            handleRequest: async (request) => {
                if (request.method === 'GET' && request.endpoint === '/users/@me/lists/list-1') {
                    return { status: 200, body: { id: 'list-1' } };
                }
                if (request.method === 'GET' && request.endpoint === '/lists/list-1/tasks/task-1') {
                    return {
                        status: 200,
                        body: {
                            id: 'task-1',
                            title: '[SDDR] Draft',
                            notes: 'speed-dial:note-conflict\nRemote version',
                            updated: '2026-04-11T12:00:00.000Z',
                        },
                    };
                }
                throw new Error(`Unexpected request: ${request.method} ${request.endpoint}`);
            },
        });

        await harness.context.pollNoteFromTasks(harness.getNote('note-conflict'));

        const note = harness.getNote('note-conflict');
        assert.strictEqual(note.content, 'Local draft changes');
        assert.strictEqual(note.taskConflict, true);
        assert.strictEqual(note.taskLocalDirty, true);
        assert.strictEqual(harness.saveSnapshots.length, 1);
        assert.deepStrictEqual(harness.notesCMValues, []);
        assert.strictEqual(harness.toasts.length, 0);
    });

    await t.test('push: when local is dirty and remote changed, marks conflict and skips overwrite', async () => {
        const harness = createTasksSyncHarness({
            tasksNotesListId: 'list-1',
            notes: [createTestNote({
                id: 'note-prepush-conflict',
                name: 'Shared Note',
                content: 'Local edit',
                taskIds: ['task-1'],
                taskLastSyncedAt: '2026-04-11T10:00:00.000Z',
                taskLocalDirty: true,
            })],
            handleRequest: async (request) => {
                if (request.method === 'GET' && request.endpoint === '/users/@me/lists/list-1') {
                    return { status: 200, body: { id: 'list-1' } };
                }
                if (request.method === 'GET' && request.endpoint === '/lists/list-1/tasks/task-1') {
                    return {
                        status: 200,
                        body: {
                            id: 'task-1',
                            title: '[SDDR] Shared Note',
                            notes: 'speed-dial:note-prepush-conflict\\nRemote edit',
                            updated: '2026-04-11T12:00:00.000Z',
                        },
                    };
                }
                throw new Error(`Unexpected request: ${request.method} ${request.endpoint}`);
            },
        });

        await harness.context.syncNoteToTasks(harness.getNote('note-prepush-conflict'));

        const note = harness.getNote('note-prepush-conflict');
        assert.strictEqual(note.taskConflict, true);
        assert.strictEqual(note.taskLocalDirty, true);
        assert.strictEqual(harness.requests.some(r => r.method === 'DELETE' && r.endpoint.startsWith('/lists/list-1/tasks/')), false);
        assert.strictEqual(harness.requests.some(r => r.method === 'POST' && r.endpoint === '/lists/list-1/tasks'), false);
        assert(harness.toasts.some(msg => msg.includes('Conflict detected')));
    });

    await t.test('remove: clears pending debounce timer, deletes remote tasks and resets sync metadata', async () => {
        const harness = createTasksSyncHarness({
            tasksNotesListId: 'list-1',
            notes: [createTestNote({
                id: 'note-remove',
                name: 'Cleanup',
                content: 'Some content',
                taskIds: ['task-1', 'task-2'],
                taskLastSyncedAt: '2026-04-11T11:00:00.000Z',
                taskLocalDirty: true,
                taskConflict: true,
            })],
            handleRequest: async (request) => {
                if (request.method === 'GET' && request.endpoint === '/users/@me/lists/list-1') {
                    return { status: 200, body: { id: 'list-1' } };
                }
                if (request.method === 'DELETE' && request.endpoint.startsWith('/lists/list-1/tasks/')) {
                    return { status: 204 };
                }
                throw new Error(`Unexpected request: ${request.method} ${request.endpoint}`);
            },
        });

        const note = harness.getNote('note-remove');
        harness.context.debounceTasksSync(note);
        assert.strictEqual(harness.getTimerCount(), 1);

        await harness.context.removeNoteFromTasks(note);
        harness.runAllTimers();

        assert.strictEqual(harness.getTimerCount(), 0);
        assert.deepStrictEqual(Array.from(note.taskIds), []);
        assert.strictEqual(note.taskLastSyncedAt, null);
        assert.strictEqual(note.taskLocalDirty, false);
        assert.strictEqual(note.taskConflict, false);
        assert.strictEqual(harness.saveSnapshots.length, 1);
        assert.strictEqual(
            harness.requests.filter(r => r.method === 'DELETE').length,
            2,
            'Remote task parts should be deleted exactly once each'
        );
    });

    await t.test('listTasksNotes: shows SDDR tasks AND plain manually-created tasks, sorts by name', async () => {
        const harness = createTasksSyncHarness({
            tasksNotesListId: 'list-1',
            handleRequest: async (request) => {
                if (request.method === 'GET' && request.endpoint === '/users/@me/lists/list-1') {
                    return { status: 200, body: { id: 'list-1' } };
                }
                if (request.method === 'GET' && request.endpoint === '/lists/list-1/tasks?showDeleted=false') {
                    return {
                        status: 200,
                        body: {
                            items: [
                                { id: 'b2', title: '[SDDR] Zebra (part 2/2)', notes: 'speed-dial:zebra\nBBBB' },
                                { id: 'a1', title: '[SDDR] Alpha', notes: 'speed-dial:alpha\nFirst line\nSecond line' },
                                { id: 'b1', title: '[SDDR] Zebra (part 1/2)', notes: 'speed-dial:zebra\nAAAA' },
                                // Manually created task — no [SDDR] prefix, should still appear
                                { id: 'x1', title: 'My Manual Note', notes: 'Plain content' },
                            ],
                        },
                    };
                }
                throw new Error(`Unexpected request: ${request.method} ${request.endpoint}`);
            },
        });

        const groups = JSON.parse(JSON.stringify(await harness.context.listTasksNotes()));

        // All 3 note groups must be returned (including the manual one)
        assert.deepStrictEqual(groups.map(g => g.name), ['Alpha', 'My Manual Note', 'Zebra']);
        // SDDR multi-part ordering preserved
        assert.deepStrictEqual(groups[2].parts.map(p => p.id), ['b1', 'b2']);
        // SDDR single-part preview
        assert.strictEqual(groups[0].parts[0].preview, 'First line\nSecond line');
        // Manual task: partNum=1, totalParts=1, preview from raw notes field
        assert.strictEqual(groups[1].parts[0].partNum, 1);
        assert.strictEqual(groups[1].parts[0].totalParts, 1);
        assert.strictEqual(groups[1].parts[0].preview, 'Plain content');
    });

    await t.test('import: reassembles remote note, creates local note and refreshes Tasks metadata', async () => {
        const longContent = 'A'.repeat(8000) + 'B'.repeat(125);
        const harness = createTasksSyncHarness({
            tasksNotesListId: 'list-1',
            notes: [createTestNote({ id: 'existing-note', name: 'Existing Note' })],
            handleRequest: async (request) => {
                if (request.method === 'GET' && request.endpoint === '/users/@me/lists/list-1') {
                    return { status: 200, body: { id: 'list-1' } };
                }
                if (request.method === 'GET' && request.endpoint === '/lists/list-1/tasks/import-task-2') {
                    return {
                        status: 200,
                        body: {
                            id: 'import-task-2',
                            title: '[SDDR] Imported Atlas (part 2/2)',
                            notes: `speed-dial:remote-note\n${longContent.slice(8000)}`,
                            updated: '2026-04-11T11:01:00.000Z',
                        },
                    };
                }
                if (request.method === 'GET' && request.endpoint === '/lists/list-1/tasks/import-task-1') {
                    return {
                        status: 200,
                        body: {
                            id: 'import-task-1',
                            title: '[SDDR] Imported Atlas (part 1/2)',
                            notes: `speed-dial:remote-note\n${longContent.slice(0, 8000)}`,
                            updated: '2026-04-11T11:00:00.000Z',
                        },
                    };
                }
                if (request.method === 'DELETE' && request.endpoint.startsWith('/lists/list-1/tasks/import-task-')) {
                    return { status: 204 };
                }
                if (request.method === 'POST' && request.endpoint === '/lists/list-1/tasks') {
                    const taskNumber = harness.requests.filter(r => r.method === 'POST' && r.endpoint === '/lists/list-1/tasks').length;
                    return {
                        status: 200,
                        body: {
                            id: `imported-new-${taskNumber}`,
                            updated: `2026-04-11T11:0${taskNumber}:30.000Z`,
                        },
                    };
                }
                throw new Error(`Unexpected request: ${request.method} ${request.endpoint}`);
            },
        });

        await harness.context.importNoteFromTasks({
            name: 'Imported Atlas',
            parts: [
                { id: 'import-task-2', partNum: 2, totalParts: 2 },
                { id: 'import-task-1', partNum: 1, totalParts: 2 },
            ],
        });

        const importedNote = harness.getLastNote();
        assert.strictEqual(importedNote.name, 'Imported Atlas');
        assert.strictEqual(importedNote.content, longContent);
        assert.strictEqual(importedNote.taskSync, true);
        assert.deepStrictEqual(Array.from(importedNote.taskIds), ['imported-new-1', 'imported-new-2']);
        assert.strictEqual(importedNote.taskLastSyncedAt, '2026-04-11T11:02:30.000Z');
        assert.strictEqual(importedNote.taskLocalDirty, false);
        assert.strictEqual(importedNote.taskConflict, false);
        assert.strictEqual(harness.context.activeNoteId, importedNote.id);
        assert.deepStrictEqual(harness.closedModals, ['notes-import-tasks-modal']);
        assert.strictEqual(harness.renderCount, 1);
        assert.strictEqual(harness.saveSnapshots.length, 2);
    });

    await t.test('push failure: network error keeps note in pending state (taskLocalDirty=true)', async () => {
        const harness = createTasksSyncHarness({
            notes: [createTestNote({
                id: 'note-net-fail',
                name: 'Offline Note',
                content: 'content',
                taskLocalDirty: false,
            })],
            handleRequest: async (request) => {
                if (request.method === 'GET' && request.endpoint === '/users/@me/lists') {
                    throw new TypeError('Load failed');
                }
                throw new Error(`Unexpected request: ${request.method} ${request.endpoint}`);
            },
        });

        await harness.context.syncNoteToTasks(harness.getNote('note-net-fail'));

        const note = harness.getNote('note-net-fail');
        assert.strictEqual(note.taskLocalDirty, true);
        assert.strictEqual(harness.context._tasksSyncInFlight.size, 0);
        assert.strictEqual(harness.saveSnapshots.length, 1);
    });
});
