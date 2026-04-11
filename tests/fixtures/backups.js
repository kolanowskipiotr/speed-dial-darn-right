/**
 * Fixture data for backup tests
 */

const fullBackupFixture = {
    _type: 'full',
    _meta: {
        version: '2.0',
        exportedAt: '2026-04-11T10:00:00.000Z'
    },
    tabs: [
        {
            id: 'tab-home-001',
            name: 'Start',
            emoji: '🏠',
            isHome: true,
            groups: []
        },
        {
            id: 'tab-work-001',
            name: 'Work',
            emoji: '💼',
            isHome: false,
            groups: [
                {
                    id: 'grp-001',
                    name: 'Tools',
                    emoji: '🔧',
                    dialSize: 140,
                    dials: [
                        {
                            id: 'dial-001',
                            name: 'GitHub',
                            url: 'https://github.com',
                            emoji: '',
                            iconType: 'favicon',
                            icon: 'https://github.com/favicon.ico',
                            visitCount: 42
                        }
                    ]
                }
            ]
        }
    ],
    todoLists: [
        {
            id: 'list-001',
            name: 'TODO',
            emoji: '✅',
            createdAt: '2026-04-01T08:00:00.000Z',
            order: 1,
            items: [
                {
                    id: 'item-001',
                    content: 'Fix backup system',
                    isDone: false,
                    createdAt: '2026-04-01T08:00:00.000Z',
                    updatedAt: '2026-04-01T08:00:00.000Z',
                    doneAt: null,
                    order: 1
                }
            ]
        }
    ],
    notes: [
        {
            id: 'note-001',
            name: 'Project Notes',
            content: 'Working on backup improvements',
            language: 'markdown',
            order: 1,
            createdAt: '2026-04-01T09:00:00.000Z',
            updatedAt: '2026-04-01T09:00:00.000Z',
            taskSync: false,
            taskIds: [],
            taskLastSyncedAt: null,
            taskLocalDirty: false,
            taskConflict: false
        }
    ],
    notesTrash: [],
    _config: {
        theme: 'dark-yellow',
        logoAnim: true,
        syncConfig: {
            autoSync: true,
            showModalOnDisconnect: true,
            folderId: 'folder-123'
        }
    },
    _images: {},
    _exportMeta: {
        version: '2.0',
        exportedAt: '2026-04-11T10:00:00.000Z',
        imageErrors: 0
    }
};

/**
 * Modified version — one note edited, one item added to todo
 */
const fullBackupModified = JSON.parse(JSON.stringify(fullBackupFixture));
fullBackupModified._exportMeta.exportedAt = '2026-04-11T11:00:00.000Z';
fullBackupModified.notes[0].content = 'Working on backup improvements — UPDATED!';
fullBackupModified.notes[0].updatedAt = '2026-04-11T11:00:00.000Z';
fullBackupModified.todoLists[0].items.push({
    id: 'item-002',
    content: 'Test diff backups',
    isDone: false,
    createdAt: '2026-04-11T11:00:00.000Z',
    updatedAt: '2026-04-11T11:00:00.000Z',
    doneAt: null,
    order: 2
});

/**
 * Format 2 diff — Item-level patches
 */
const diffFormat2 = {
    _type: 'diff',
    _meta: {
        diffAt: '2026-04-11T11:00:00.000Z',
        fullBackupId: 'backup-full-001',
        fullBackupName: 'backup_2026-04-11T10.full.json',
        baseExportedAt: '2026-04-11T10:00:00.000Z',
        diffFormat: 2
    },
    notes_patch: {
        upsert: [
            {
                id: 'note-001',
                name: 'Project Notes',
                content: 'Working on backup improvements — UPDATED!',
                language: 'markdown',
                order: 1,
                createdAt: '2026-04-01T09:00:00.000Z',
                updatedAt: '2026-04-11T11:00:00.000Z',
                taskSync: false,
                taskIds: [],
                taskLastSyncedAt: null,
                taskLocalDirty: false,
                taskConflict: false
            }
        ],
        delete: []
    },
    todoLists_patch: {
        upsert: [
            {
                id: 'list-001',
                name: 'TODO',
                emoji: '✅',
                createdAt: '2026-04-01T08:00:00.000Z',
                order: 1,
                items: [
                    {
                        id: 'item-001',
                        content: 'Fix backup system',
                        isDone: false,
                        createdAt: '2026-04-01T08:00:00.000Z',
                        updatedAt: '2026-04-01T08:00:00.000Z',
                        doneAt: null,
                        order: 1
                    },
                    {
                        id: 'item-002',
                        content: 'Test diff backups',
                        isDone: false,
                        createdAt: '2026-04-11T11:00:00.000Z',
                        updatedAt: '2026-04-11T11:00:00.000Z',
                        doneAt: null,
                        order: 2
                    }
                ]
            }
        ],
        delete: []
    }
};

/**
 * Format 1 diff (legacy, section-level) — for backward compatibility tests
 */
const diffFormat1 = {
    _type: 'diff',
    _meta: {
        diffAt: '2026-04-11T11:00:00.000Z',
        fullBackupId: 'backup-full-001',
        fullBackupName: 'backup_2026-04-11T10.full.json',
        baseExportedAt: '2026-04-11T10:00:00.000Z'
        // note: no diffFormat field — means Format 1
    },
    notes: fullBackupModified.notes,
    todoLists: fullBackupModified.todoLists
};

module.exports = {
    fullBackupFixture,
    fullBackupModified,
    diffFormat2,
    diffFormat1
};

