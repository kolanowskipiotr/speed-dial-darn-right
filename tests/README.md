# Speed Dial Darn Right — Integration Tests

Integration tests for app usage scenarios with mocked Google Drive integrations.

## Structure

```
tests/
├── fixtures/          — sample backup and fixture data
│   ├── backups.js     — Full/Diff backup fixtures (Format 1 & 2)
│   └── helpers.js     — test helpers
├── domain/
│   └── persistence/
│       └── sync-backup/
│           ├── helpers/
│           │   └── restore-helpers.js  — shared applyDiff/applyArrayPatch helpers
│           ├── apply-diff.test.js
│           ├── restore-full.test.js
│           ├── restore-diff.test.js
│           ├── rate-limit.test.js
│           └── edge-cases.test.js
├── uploader/
│   └── sync/
│       ├── build-array-patch.test.js
│       └── calculate-diff.test.js
└── README.md
```

## Covered Test Scenarios

### 1. Bug 1 (CRITICAL): Item-level diff backups — Format 2
- ✅ `buildArrayPatch` — identifies changed, new, and deleted items
- ✅ `calculateDiff` — generates Format 2 diff with `diffFormat: 2`
- ✅ Diff includes only changed sections (`*_patch` keys)
- ✅ Diff is smaller than a full backup

### 2. Bug 1 (CRITICAL): Restore scenarios
- ✅ **Restore Full Backup** — download `.full.json` from GDrive and apply
- ✅ **Restore Diff Backup** — download `.full.json`, apply diff, verify correct data
- ✅ **Chain Multiple Diffs** — apply multiple diffs in sequence
- ✅ **Backward Compatibility** — legacy Format 1 diff backups still work

### 3. Bug 2 (SECONDARY): Manual backup rate-limiting
- ✅ Enforce 24h cooldown between `triggerManualSync()` calls
- ✅ Allow backup after 24h
- ✅ Allow first backup (no previous backup)

### 4. Edge Cases
- ✅ Empty patch (no changed items)
- ✅ Preserve item order after patch apply
- ✅ Append new items at the end

## Running Tests

```bash
cd /Users/pkolanow/private-workspace/speed-dial-darn-right
npm test --prefix uploader
```

**Expected result:**
```
✓ 29 tests passing
```

## Dependencies

- `node:test` — built into Node.js (no extra packages)
- `assert` — built into Node.js

## Test Structure

Each test imports:
1. `__test__` helpers from `uploader/sync.js` (`buildArrayPatch`, `calculateDiff`)
2. Shared functions `applyDiff`, `applyArrayPatch` from `tests/domain/persistence/sync-backup/helpers/restore-helpers.js`
3. Fixture data from `tests/fixtures/backups.js`

### Fixtures

- `fullBackupFixture` — full backup with 2 tabs, 1 note, 1 todo list
- `fullBackupModified` — updated note + added todo item
- `diffFormat2` — Format 2 diff (item-level patches)
- `diffFormat1` — Format 1 diff (section-level, backward compatibility)

## Notes

- Tests do NOT use external services (Google Drive is mocked)
- Tests validate **data logic**, not UI or HTTP
- All tests are **synchronous** (fast)
- You can extend this with `uploader/server.js` tests using Supertest if needed


