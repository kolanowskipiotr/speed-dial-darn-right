/**
 * Test helpers and utilities
 */

const assert = require('assert');

/**
 * Deep equal with better error messages
 */
function assertDeepEqual(actual, expected, message) {
    try {
        assert.deepStrictEqual(actual, expected);
    } catch (e) {
        console.error(message || 'Deep equal failed');
        console.error('Expected:', JSON.stringify(expected, null, 2));
        console.error('Actual:', JSON.stringify(actual, null, 2));
        throw e;
    }
}

/**
 * Verify backup file structure
 */
function verifyBackupStructure(backup, isFull = true) {
    assert(backup._type, 'Backup must have _type');
    assert(backup._meta, 'Backup must have _meta');

    if (isFull) {
        assert.strictEqual(backup._type, 'full', 'Full backup must have _type=full');
        assert(Array.isArray(backup.tabs), 'Full backup must have tabs array');
        assert(Array.isArray(backup.todoLists), 'Full backup must have todoLists array');
        assert(Array.isArray(backup.notes), 'Full backup must have notes array');
        assert(backup._config, 'Full backup must have _config');
        assert(backup._images !== undefined, 'Full backup must have _images');
        assert(backup._exportMeta, 'Full backup must have _exportMeta');
    } else {
        assert.strictEqual(backup._type, 'diff', 'Diff backup must have _type=diff');
        assert(backup._meta.fullBackupId, 'Diff must have fullBackupId in _meta');
        // Diff doesn't need to have full arrays — just patches
    }
}

/**
 * Verify diff format (2 = new item-level, undefined/else = format 1)
 */
function isDiffFormat2(diff) {
    if (diff._meta && diff._meta.diffFormat === 2) return true;
    return Object.keys(diff).some(k => k.endsWith('_patch'));
}

/**
 * Count upserted and deleted items in a diff patch
 */
function countPatchChanges(patch) {
    return {
        upserted: (patch?.upsert || []).length,
        deleted: (patch?.delete || []).length
    };
}

module.exports = {
    assertDeepEqual,
    verifyBackupStructure,
    isDiffFormat2,
    countPatchChanges
};

