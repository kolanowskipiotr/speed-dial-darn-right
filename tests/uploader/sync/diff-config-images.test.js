const test = require('node:test');
const assert = require('assert');

const { __test__: { calculateDiff, hasMeaningfulDiff } } = require('../../../uploader/sync');
const {
    SnapshotBuilder, makeNote, makeTodoList, makeTodoItem,
    modify, asFullBackup
} = require('../../fixtures/builders');

// ─── Helpers ────────────────────────────────────────────────────

function diff(base, modified) {
    return calculateDiff(asFullBackup(base), modified);
}

function emptyBase() {
    return new SnapshotBuilder().build();
}

// ─── Tests ──────────────────────────────────────────────────────

test('calculateDiff — _config and _images', async (t) => {

    // ── Config: no changes ───────────────────────────────────────

    await t.test('unchanged config → _config absent from diff', () => {
        const base = emptyBase();
        const result = diff(base, modify(base, () => {}));
        assert(!result._config, '_config should not appear in diff when unchanged');
    });

    // ── Config field changes ─────────────────────────────────────

    await t.test('theme change → _config in diff with new theme', () => {
        const base = emptyBase();
        const modified = modify(base, s => { s._config.theme = 'light-blue'; });
        const result = diff(base, modified);
        assert(result._config, '_config should be in diff');
        assert.strictEqual(result._config.theme, 'light-blue');
    });

    await t.test('logoAnim change → _config in diff', () => {
        const base = emptyBase();
        const modified = modify(base, s => { s._config.logoAnim = false; });
        const result = diff(base, modified);
        assert(result._config);
        assert.strictEqual(result._config.logoAnim, false);
    });

    await t.test('syncConfig.autoSync change → _config in diff', () => {
        const base = emptyBase();
        const modified = modify(base, s => { s._config.syncConfig.autoSync = true; });
        const result = diff(base, modified);
        assert(result._config);
        assert.strictEqual(result._config.syncConfig.autoSync, true);
    });

    await t.test('syncConfig.folderId change → _config in diff', () => {
        const base = emptyBase();
        const modified = modify(base, s => { s._config.syncConfig.folderId = 'gdrive-folder-abc'; });
        const result = diff(base, modified);
        assert(result._config);
        assert.strictEqual(result._config.syncConfig.folderId, 'gdrive-folder-abc');
    });

    await t.test('syncConfig.showModalOnDisconnect change → _config in diff', () => {
        const base = emptyBase();
        const modified = modify(base, s => { s._config.syncConfig.showModalOnDisconnect = false; });
        const result = diff(base, modified);
        assert(result._config);
        assert.strictEqual(result._config.syncConfig.showModalOnDisconnect, false);
    });

    await t.test('weather config added → _config in diff with full weather object', () => {
        const base = emptyBase(); // weather: null by default
        const modified = modify(base, s => {
            s._config.weather = { enabled: true, city: 'Warsaw', lat: 52.23, lon: 21.01, label: 'Warsaw, Poland', unit: 'C' };
        });
        const result = diff(base, modified);
        assert(result._config);
        assert.strictEqual(result._config.weather.city, 'Warsaw');
    });

    await t.test('_config stores entire new config object (not a partial patch)', () => {
        const base = new SnapshotBuilder().config({ theme: 'dark-yellow', logoAnim: true }).build();
        const modified = modify(base, s => { s._config.theme = 'light-blue'; });
        const result = diff(base, modified);
        // The entire _config is stored, not just the changed field
        assert(result._config.syncConfig, '_config must include all fields, not just the diff');
        assert.strictEqual(result._config.logoAnim, true);
    });

    // ── Images: no changes ───────────────────────────────────────

    await t.test('unchanged _images → _images absent from diff', () => {
        const base = new SnapshotBuilder().image('img-001', 'data:image/png;base64,ABC').build();
        const result = diff(base, modify(base, () => {}));
        assert(!result._images, '_images should not appear in diff when unchanged');
    });

    // ── Image changes ────────────────────────────────────────────

    await t.test('new image added → _images in diff with new image only', () => {
        const base = new SnapshotBuilder()
            .image('img-existing', 'data:image/png;base64,EXISTING')
            .build();
        const modified = modify(base, s => {
            s._images['img-new'] = 'data:image/png;base64,NEW';
        });
        const result = diff(base, modified);
        assert(result._images, '_images should be in diff');
        assert(result._images['img-new'], 'New image should be in diff');
        assert(!result._images['img-existing'], 'Existing unchanged image must not be in diff');
    });

    await t.test('image content changed → _images in diff with updated image', () => {
        const base = new SnapshotBuilder()
            .image('img-001', 'data:image/png;base64,OLD_DATA')
            .build();
        const modified = modify(base, s => { s._images['img-001'] = 'data:image/png;base64,NEW_DATA'; });
        const result = diff(base, modified);
        assert(result._images);
        assert.strictEqual(result._images['img-001'], 'data:image/png;base64,NEW_DATA');
    });

    await t.test('multiple images: only new/changed ones in diff', () => {
        const base = new SnapshotBuilder()
            .image('img-a', 'data:image/png;base64,A')
            .image('img-b', 'data:image/png;base64,B')
            .build();
        const modified = modify(base, s => {
            s._images['img-b'] = 'data:image/png;base64,B_UPDATED';
            s._images['img-c'] = 'data:image/png;base64,C_NEW';
        });
        const result = diff(base, modified);
        assert(result._images);
        assert(!result._images['img-a'], 'Unchanged image-a must not be in diff');
        assert.strictEqual(result._images['img-b'], 'data:image/png;base64,B_UPDATED');
        assert.strictEqual(result._images['img-c'], 'data:image/png;base64,C_NEW');
    });

    await t.test('image deleted from snapshot → NOT tracked in diff (by design: deletion not tracked)', () => {
        const base = new SnapshotBuilder().image('img-001', 'data:image/png;base64,DATA').build();
        const modified = modify(base, s => { delete s._images['img-001']; });
        const result = diff(base, modified);
        // Image deletions are not tracked in _images diff (images may still be referenced elsewhere)
        assert(!result._images, 'No _images in diff when image removed without replacement');
    });

    await t.test('todo item with image ref + image data added → both todoItems_patch and _images', () => {
        const base = new SnapshotBuilder()
            .todoList(makeTodoList({ id: 'list-1' }, [
                makeTodoItem({ id: 'item-1', content: 'No image' })
            ]))
            .build();
        const modified = modify(base, s => {
            s.todoLists[0].items[0].content = 'With image: ![img](/uploads/todo-img.png)';
            s._images['todo-img.png'] = 'data:image/png;base64,IMG_DATA';
        });
        const result = diff(base, modified);
        assert(result.todoItems_patch?.['list-1'], 'Item content change should be in patch');
        assert(result._images?.['todo-img.png'], 'New image should be in diff');
    });

    await t.test('note with image ref + image data added → both notes_patch and _images', () => {
        const base = new SnapshotBuilder()
            .note(makeNote({ id: 'note-1', content: 'No image' }))
            .build();
        const modified = modify(base, s => {
            s.notes[0].content = '# Title\n\n![diagram](/uploads/note-img.png)';
            s._images['note-img.png'] = 'data:image/png;base64,NOTE_IMG';
        });
        const result = diff(base, modified);
        assert(result.notes_patch, 'Note change should be in patch');
        assert(result._images?.['note-img.png'], 'New note image should be in diff');
    });

    await t.test('config and image both change → meaningful diff with both', () => {
        const base = emptyBase();
        const modified = modify(base, s => {
            s._config.theme = 'light';
            s._images['icon.png'] = 'data:image/png;base64,ICON';
        });
        const result = diff(base, modified);
        assert.strictEqual(hasMeaningfulDiff(result), true);
        assert(result._config);
        assert(result._images);
    });
});
