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
✔ Bug 1: buildArrayPatch — item-level patches (5 tests) ✓
✔ Bug 1: calculateDiff — Format 2 diff backups (5 tests) ✓
✔ Bug 1: applyDiff — restore scenarios (4 tests) ✓
✔ Restore Full Backup scenario (1 test) ✓
✔ Restore Diff Backup scenario (2 tests) ✓
✔ Rate-limiting manual backups (3 tests) ✓
✔ Edge cases (3 tests) ✓

ℹ tests 29
ℹ pass 29
ℹ fail 0
```

## Test Files

- **`tests/uploader/sync/build-array-patch.test.js`** — `buildArrayPatch` scenarios
- **`tests/uploader/sync/calculate-diff.test.js`** — Format 2 `calculateDiff` scenarios
- **`tests/domain/persistence/sync-backup/apply-diff.test.js`** — `applyDiff` restore scenarios
- **`tests/domain/persistence/sync-backup/restore-full.test.js`** — full backup restore scenario
- **`tests/domain/persistence/sync-backup/restore-diff.test.js`** — diff restore and chained diffs
- **`tests/domain/persistence/sync-backup/rate-limit.test.js`** — manual backup cooldown rules
- **`tests/domain/persistence/sync-backup/edge-cases.test.js`** — patch edge cases
- **`tests/domain/persistence/sync-backup/helpers/restore-helpers.js`** — shared apply helpers for restore tests
- **`tests/fixtures/backups.js`** — Fixture data (full/diff backups)
- **`tests/fixtures/helpers.js`** — Test assertion helpers

## What Each Test Checks

### Format 2 Diff Generation
```
✓ Should create diffFormat: 2 metadata
✓ Should only include changed items (not entire sections)
✓ Should omit _patch keys if section unchanged
✓ Diff should be smaller than full backup
```

### Restore Scenarios
```
✓ Restore full backup from GDrive
✓ Restore using diff+full backup
✓ Chain multiple diffs
✓ Format 1 backward compatibility
```

### Rate-Limiting
```
✓ Enforce 24h cooldown between manual backups
✓ Allow backup after cooldown expires
✓ Allow first manual backup (no previous)
```

## Test Implementation Details

Each test:
1. Uses `node:test` (Node.js built-in, no extra dependencies)
2. Tests pure logic (no DOM, no HTTP, no browser)
3. Runs synchronously (~450ms total)
4. Includes descriptive error messages

## Adding More Tests

To add a test scenario:

```javascript
await t.test('my scenario', () => {
    // arrange
    const backup = fullBackupFixture;

    // act
    const result = calculateDiff(backup, modified);

    // assert
    assert(result.notes_patch, 'Should have notes_patch');
});
```

## Troubleshooting

**Tests fail with "Cannot find module":**
```bash
# Make sure you're in the right directory
cd /Users/pkolanow/private-workspace/speed-dial-darn-right
npm test --prefix uploader
```

**Tests timeout:**
- Tests should complete in <500ms
- If timeout, check for infinite loops in test code

**Syntax errors:**
```bash
# Check syntax
node -c uploader/sync.js
node -c tests/uploader/sync/calculate-diff.test.js
```

## Integration with CI/CD

To add to GitHub Actions or similar:

```yaml
- name: Run backup tests
  run: npm test --prefix uploader
  working-directory: ./speed-dial-darn-right
```


