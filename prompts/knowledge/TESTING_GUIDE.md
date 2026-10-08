# Quick Start: Running Tests

## Prerequisites
- Node.js (v18+)
- macOS (or any Unix-like system)

## Run All Tests

```bash
cd /Users/pkolanow/private-workspace/speed-dial-darn-right
npm test --prefix uploader

```

## Expected Output

```
✔ Google Tasks ↔ notes integration (8 tests) ✓
✔ Bug 1: applyDiff — restore scenarios (5 tests) ✓
✔ Edge cases (3 tests) ✓
✔ Rate-limiting manual backups (3 tests) ✓
✔ Restore Diff Backup scenario (2 tests) ✓
✔ Restore Full Backup scenario (1 test) ✓
✔ m365 calendar logic (6 tests) ✓
✔ m365 calendar server endpoints (7 tests) ✓
✔ Bug 1: buildArrayPatch — item-level patches (7 tests) ✓
✔ Bug 1: calculateDiff — Format 2 diff backups (8 tests) ✓
✔ calculateDiff — _config and _images (16 tests) ✓
✔ calculateDiff — notes, trash, and Google Tasks sync fields (19 tests) ✓
✔ calculateDiff — tabs / groups / dials (22 tests) ✓
✔ calculateDiff — todo lists and items (16 tests) ✓
✔ Backup roundtrip: calculateDiff → applyDiff (15 tests) ✓

ℹ tests 153
ℹ pass 153
ℹ fail 0
```

## Test Files

### Core backup logic — `uploader/sync.js`
- **`tests/uploader/sync/build-array-patch.test.js`** — `buildArrayPatch` scenarios
- **`tests/uploader/sync/calculate-diff.test.js`** — Format 2 `calculateDiff` scenarios (original)
- **`tests/uploader/sync/diff-tabs.test.js`** — Tabs, groups, dials: all change scenarios + visitCount exclusion
- **`tests/uploader/sync/diff-todo.test.js`** — Todo lists (metadata) and items (content, done, order, image refs)
- **`tests/uploader/sync/diff-notes.test.js`** — Notes, notesTrash, and all Google Tasks sync fields
- **`tests/uploader/sync/diff-config-images.test.js`** — `_config` changes and `_images` tracking
- **`tests/uploader/sync/roundtrip.test.js`** — End-to-end: `calculateDiff` → `applyDiff` equals modified state

### Restore logic — browser-side `sync-backup.js`
- **`tests/domain/persistence/sync-backup/apply-diff.test.js`** — `applyDiff` restore scenarios
- **`tests/domain/persistence/sync-backup/restore-full.test.js`** — Full backup restore scenario
- **`tests/domain/persistence/sync-backup/restore-diff.test.js`** — Diff restore and chained diffs
- **`tests/domain/persistence/sync-backup/rate-limit.test.js`** — Manual backup cooldown rules
- **`tests/domain/persistence/sync-backup/edge-cases.test.js`** — Patch edge cases
- **`tests/domain/persistence/sync-backup/helpers/restore-helpers.js`** — Shared apply helpers

### Integration
- **`tests/domain/note/tasks-sync/integration.test.js`** — Google Tasks ↔ notes push/pull/conflict

### Fixtures & builders
- **`tests/fixtures/backups.js`** — Fixture data (full/diff backups, legacy format)
- **`tests/fixtures/helpers.js`** — Assertion helpers (`assertDeepEqual`, `verifyBackupStructure`, …)
- **`tests/fixtures/builders.js`** — Factory functions + `SnapshotBuilder` for composing test snapshots

## What Each Test Suite Checks

### diff-tabs (22 tests)
```
✓ Unchanged snapshot → no tabs_patch
✓ visitCount / lastVisited changes ignored
✓ Tab name, emoji, isHome changes
✓ New tab added / deleted
✓ Group name, emoji, dialSize changes (entire tab upserted)
✓ New group / group deleted
✓ Dial URL, name, emoji, iconType (favicon/emoji/custom/none) changes
✓ New dial / dial deleted
✓ Only changed tab in patch; unchanged tabs excluded
```

### diff-todo (16 tests)
```
✓ Unchanged snapshot → no patch
✓ List name, emoji, order changes → todoLists_patch (metadata only)
✓ List deleted → todoLists_patch.delete
✓ New list (empty) and new list with items → full list in todoLists_patch.upsert
✓ New item, content change, image ref, marked done, marked undone, order change, deleted
✓ Items in multiple lists patched independently
✓ List metadata + items both changed → both patch keys present
```

### diff-notes (19 tests)
```
✓ Unchanged snapshot → no patch
✓ Note content, name, language, order changes
✓ Note with image reference in content
✓ New note → notes_patch.upsert
✓ Note moved to trash → notes_patch.delete + notesTrash_patch.upsert
✓ Trashed note changed, permanently deleted, restored
✓ taskSync (false→true), taskIds, taskLocalDirty, taskConflict, taskLastSyncedAt changes
✓ Fully synced note with no changes → no patch
```

### diff-config-images (16 tests)
```
✓ Unchanged config → _config absent
✓ theme, logoAnim, syncConfig.autoSync, syncConfig.folderId, syncConfig.showModalOnDisconnect, weather
✓ _config stores entire object (not partial)
✓ New image / changed image → _images in diff (old images excluded)
✓ Multiple images: only new/changed ones in diff
✓ Image deletion not tracked (design: deletions are silent)
✓ Todo item image + note image correctly tracked
```

### roundtrip (15 tests)
```
✓ No-op roundtrip (no changes)
✓ Tab name, new dial, tab deletion, group dialSize
✓ New todo item, item marked done, list metadata + item, new list with items
✓ Note content, note moved to trash, taskSync fields
✓ Config change, new image
✓ Complex multi-section: tab rename + dial + todo list + item + note taskSync + trash purge + config + image
```

## Builders (`tests/fixtures/builders.js`)

Avoid boilerplate by composing test data with factory functions and `SnapshotBuilder`:

```javascript
const { SnapshotBuilder, makeTab, makeGroup, makeDial, makeTodoList,
        makeTodoItem, makeNote, makeTrashedNote, modify, asFullBackup }
    = require('../../fixtures/builders');

// Build a base snapshot
const base = new SnapshotBuilder()
    .tab(makeTab({ id: 'tab-1' }, [makeGroup({ id: 'grp-1' }, [makeDial({ id: 'dial-1' })])]))
    .note(makeNote({ id: 'note-1', content: 'Hello' }))
    .todoList(makeTodoList({ id: 'list-1' }, [makeTodoItem({ id: 'item-1' })]))
    .build();

// Deep-clone and mutate
const modified = modify(base, snap => { snap.notes[0].content = 'Updated'; });

// Wrap for calculateDiff
const fullBackup = asFullBackup(base);
const diff = calculateDiff(fullBackup, modified);
```

All factory functions accept an `overrides` object. Auto-generated IDs are used when `id` is omitted.

## Adding More Tests

```javascript
const { SnapshotBuilder, makeNote, modify, asFullBackup } = require('../../fixtures/builders');
const { __test__: { calculateDiff } } = require('../../../uploader/sync');

await t.test('my scenario', () => {
    const base = new SnapshotBuilder().note(makeNote({ id: 'n1', content: 'old' })).build();
    const modified = modify(base, s => { s.notes[0].content = 'new'; });
    const result = calculateDiff(asFullBackup(base), modified);
    assert(result.notes_patch);
});
```

## Test Implementation Details

Each test:
1. Uses `node:test` (Node.js built-in, no extra dependencies)
2. Tests pure logic (no DOM, no HTTP, no browser)
3. Runs synchronously (~500ms total for all 153 tests)

## Troubleshooting

**Tests fail with "Cannot find module":**
```bash
cd /Users/pkolanow/private-workspace/speed-dial-darn-right
npm test --prefix uploader
```

**Tests timeout:**
- Tests should complete in <1000ms total
- If timeout, check for infinite loops

**Syntax errors:**
```bash
node -c uploader/sync.js
node -c tests/uploader/sync/diff-tabs.test.js
```

## Integration with CI/CD

```yaml
- name: Run backup tests
  run: npm test --prefix uploader
  working-directory: ./speed-dial-darn-right
```
