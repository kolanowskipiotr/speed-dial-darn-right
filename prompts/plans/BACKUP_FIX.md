# BACKUP_FIX — Plan naprawy systemu backupu Google Drive

## Przegląd problemów

System backupu ma trzy błędy:

| # | Priorytet | Opis |
|---|-----------|------|
| 1 | **KRYTYCZNY** | Diff backupy zawierają całe sekcje danych — wyglądają jak pełne backupy |
| 2 | **WTÓRNY** | Brak ograniczenia częstotliwości dla ręcznych backupów (przycisk "Backup Now") |
| 3 | **DROBNY** | Harmonogram tygodniowego pełnego backupu może się przesuwać o kilkanaście godzin |

---

## Bug 1 (KRYTYCZNY): Diff backupy są de facto pełnymi backupami

### Opis problemu

`calculateDiff` w `uploader/sync.js` porównuje całe sekcje (`tabs`, `todoLists`, `notes`,
`notesTrash`) jako jeden ciąg JSON. Jeśli cokolwiek w sekcji się zmieni, **cała sekcja**
trafia do diffa. Przykład: edytowanie jednej notatki spośród 50 → 50 notatek w diffie.
Połączone z `_config` i `_images`, plik diff jest niemal identyczny z pełnym backupem.

**Obecny kod (buggy) w `uploader/sync.js`:**
```js
if (JSON.stringify(oldData.notes) !== JSON.stringify(newData.notes)) {
    diff.notes = newData.notes;  // cały array — ŹRÓDŁO BŁĘDU
}
```

### Oczekiwane zachowanie

Diff powinien zawierać wyłącznie zmienione, dodane lub usunięte elementy na poziomie
poszczególnych obiektów (tab, note, todoList) — nie całych sekcji.

---

### Nowy format pliku diff (Format 2)

```json
{
  "_type": "diff",
  "_meta": {
    "diffAt": "2026-04-11T10:00:00.000Z",
    "fullBackupId": "1abc...",
    "fullBackupName": "backup_2026-04-04.full.json",
    "baseExportedAt": "2026-04-04T08:00:00.000Z",
    "diffFormat": 2
  },
  "tabs_patch":       { "upsert": [...zmienione/nowe tab-obiekty...], "delete": [...usunięte tab-id...] },
  "todoLists_patch":  { "upsert": [...], "delete": [...] },
  "notes_patch":      { "upsert": [...], "delete": [...] },
  "notesTrash_patch": { "upsert": [...], "delete": [...] },
  "_config":          { ...cały obiekt, jeśli się zmienił... },
  "_images":          { ...tylko nowe/zmienione obrazy... }
}
```

Pole `_meta.diffFormat: 2` jednoznacznie odróżnia nowy format od starego (brak tego pola = Format 1 = stary).
Klucze `*_patch` pojawiają się tylko wtedy, gdy dana sekcja faktycznie się zmieniła.

---

### Implementacja: `uploader/sync.js`

#### 1. Dodać funkcję pomocniczą `buildArrayPatch` (przed `calculateDiff`)

```js
/**
 * Buduje patch dla tablicy obiektów identyfikowanych przez pole `id`.
 * - upsert: obiekty nowe lub zmienione (wg JSON.stringify)
 * - delete: id obiektów obecnych w oldArr, brakujących w newArr
 */
function buildArrayPatch(oldArr = [], newArr = []) {
    const oldMap = new Map(oldArr.map(item => [item.id, item]));
    const newMap = new Map(newArr.map(item => [item.id, item]));

    const upsert = [];
    for (const [id, newItem] of newMap) {
        const oldItem = oldMap.get(id);
        if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
            upsert.push(newItem);
        }
    }

    const deleted = [];
    for (const id of oldMap.keys()) {
        if (!newMap.has(id)) deleted.push(id);
    }

    return { upsert, delete: deleted };
}
```

> **Uwaga o `tabs`:** Każdy tab zawiera `groups[]` z `dials[]`. Porównanie na poziomie
> całego tab-obiektu (nie rekursywne w grupy/diale) jest wystarczające — zmiana jednego
> diala zapisuje cały tab zamiast wszystkich tabów. To wielka poprawa bez nadmiernej złożoności.

#### 2. Zastąpić `calculateDiff` nową implementacją

```js
function calculateDiff(fullBackup, newData) {
    const oldData = fullBackup.data;
    const diff = {
        _type: 'diff',
        _meta: {
            diffAt: new Date().toISOString(),
            fullBackupId: fullBackup.id,
            fullBackupName: fullBackup.name,
            baseExportedAt: oldData._exportMeta?.exportedAt,
            diffFormat: 2
        }
    };

    const tabsPatch = buildArrayPatch(oldData.tabs, newData.tabs);
    if (tabsPatch.upsert.length > 0 || tabsPatch.delete.length > 0) {
        diff.tabs_patch = tabsPatch;
    }

    const todoListsPatch = buildArrayPatch(oldData.todoLists, newData.todoLists);
    if (todoListsPatch.upsert.length > 0 || todoListsPatch.delete.length > 0) {
        diff.todoLists_patch = todoListsPatch;
    }

    const notesPatch = buildArrayPatch(oldData.notes, newData.notes);
    if (notesPatch.upsert.length > 0 || notesPatch.delete.length > 0) {
        diff.notes_patch = notesPatch;
    }

    const notesTrashPatch = buildArrayPatch(oldData.notesTrash, newData.notesTrash);
    if (notesTrashPatch.upsert.length > 0 || notesTrashPatch.delete.length > 0) {
        diff.notesTrash_patch = notesTrashPatch;
    }

    if (JSON.stringify(oldData._config) !== JSON.stringify(newData._config)) {
        diff._config = newData._config;
    }

    // _images: tylko nowe/zmienione obrazy (logika bez zmian)
    const newImages = {};
    for (const id in newData._images) {
        if (newData._images[id] !== oldData._images[id]) {
            newImages[id] = newData._images[id];
        }
    }
    if (Object.keys(newImages).length > 0) {
        diff._images = newImages;
    }

    return diff;
}
```

---

### Implementacja: `domain/persistence/sync-backup.js`

#### 1. Zastąpić `applyDiff` wersją z detekcją formatu 1 vs 2

```js
function applyDiff(fullData, diff) {
    const result = { ...fullData };
    const isNewFormat = diff._meta?.diffFormat === 2
        || Object.keys(diff).some(k => k.endsWith('_patch'));

    if (isNewFormat) {
        // Format 2: item-level patches
        if (diff.tabs_patch)       result.tabs       = applyArrayPatch(fullData.tabs       || [], diff.tabs_patch);
        if (diff.todoLists_patch)  result.todoLists  = applyArrayPatch(fullData.todoLists  || [], diff.todoLists_patch);
        if (diff.notes_patch)      result.notes      = applyArrayPatch(fullData.notes      || [], diff.notes_patch);
        if (diff.notesTrash_patch) result.notesTrash = applyArrayPatch(fullData.notesTrash || [], diff.notesTrash_patch);
    } else {
        // Format 1 (stary): section-level overwrite — zachowane dla backupów historycznych
        if (diff.tabs !== undefined)       result.tabs = diff.tabs;
        if (diff.todoLists !== undefined)  result.todoLists = diff.todoLists;
        if (diff.notes !== undefined)      result.notes = diff.notes;
        if (diff.notesTrash !== undefined) result.notesTrash = diff.notesTrash;
    }

    // Wspólne dla obu formatów
    if (diff._config !== undefined)  result._config = diff._config;
    if (diff._images !== undefined)  result._images = { ...fullData._images, ...diff._images };

    return result;
}
```

#### 2. Dodać nową funkcję `applyArrayPatch` (zaraz po `applyDiff`)

```js
/**
 * Aplikuje patch {upsert, delete} na tablicę obiektów identyfikowanych przez `id`.
 * - Zachowuje kolejność: elementy bazowe (niezmienione lub zaktualizowane) na swoich miejscach
 * - Usunięte (wg id) są odfiltrowywane
 * - Nowe (wg id nieobecne w baseArr) dołączane na końcu
 */
function applyArrayPatch(baseArr, patch) {
    const upsertMap = new Map((patch.upsert || []).map(item => [item.id, item]));
    const deleteSet = new Set(patch.delete || []);

    // Przefiltruj usunięte, zaktualizuj zmienione — zachowaj kolejność
    const result = baseArr
        .filter(item => !deleteSet.has(item.id))
        .map(item => upsertMap.has(item.id) ? upsertMap.get(item.id) : item);

    // Dodaj nowe elementy (id nieobecne w baseArr)
    const existingIds = new Set(baseArr.map(item => item.id));
    for (const item of (patch.upsert || [])) {
        if (!existingIds.has(item.id)) result.push(item);
    }

    return result;
}
```

---

## Bug 2 (WTÓRNY): Brak rate-limitingu ręcznych backupów

### Opis problemu

1. Przycisk "Backup Now" wywołuje `triggerManualSync()` bez żadnego ograniczenia — tworzony jest nowy backup przy każdym kliknięciu.
2. `triggerManualSync` aktualizuje `lastAutoSync = Date.now()`, co resetuje licznik 24-godzinny auto-backupu — ale nie zapobiega kolejnym kliknięciom.

**Błędny fragment `sync-backup.js`:**
```js
// W triggerManualSync():
lastAutoSync = Date.now(); // BUG: nadpisuje licznik auto-backupu — nie powinien
```

### Rozwiązanie: Oddzielne timery `lastAutoSync` i `lastManualSync`

**Zasada:**
- `lastAutoSync` — aktualizowany **wyłącznie** przez `checkAutoSync()`. Kontroluje 24h okno auto-backupu.
- `lastManualSync` — aktualizowany **wyłącznie** przez `triggerManualSync()`. Cooldown 24h dla ręcznych backupów.
- Oba timery są niezależne — manualny backup nie resetuje auto-backupu i odwrotnie.

---

### Implementacja: `domain/persistence/sync.js`

#### 1. Dodać nową zmienną stanu

```js
let lastAutoSync = null;
let lastManualSync = null;  // NOWE: timestamp (ms) ostatniego ręcznego backupu
```

#### 2. Zaktualizować `loadSyncSettings()`

```js
lastAutoSync   = settings.lastAutoSync   || null;
lastManualSync = settings.lastManualSync || null;  // NOWE
```

#### 3. Zaktualizować `saveSyncSettings()`

```js
lastAutoSync:   lastAutoSync,
lastManualSync: lastManualSync,  // NOWE
```

---

### Implementacja: `domain/persistence/sync-backup.js`

#### Zaktualizować `triggerManualSync()` — dodać rate-limit i naprawić timer

```js
async function triggerManualSync() {
    if (!googleUser || !currentAccessToken || !currentFolderId) {
        showToast(`${ICONS.warn} Please log in and select a folder first.`);
        return;
    }

    // Rate-limit: max jeden ręczny backup na 24h
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (lastManualSync && (Date.now() - lastManualSync) < twentyFourHours) {
        const nextAt = new Date(lastManualSync + twentyFourHours)
            .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        showToast(`${ICONS.warn} Manual backup cooldown active. Next available at ${nextAt}.`);
        return;
    }

    manualSyncBtn.disabled = true;
    backupInProgress = true;
    syncStatusSpan.textContent = 'Backing up...';
    try {
        const exportObj = await getExportObject();
        const res = await fetch(BACKUP_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAccessToken}`,
                'X-GDrive-Folder-Id': currentFolderId
            },
            body: JSON.stringify(exportObj)
        });
        if (res.ok) {
            syncStatusSpan.textContent = 'Backup successful!';
            lastManualSync = Date.now(); // FIX: używa lastManualSync, NIE lastAutoSync
            saveSyncSettings();
            updateSyncIndicators();
            showToast(`${ICONS.ok} Backup complete!`);
            setTimeout(fetchGDriveBackups, 1500);
        } else {
            const errorText = `Backup failed: ${res.status}`;
            if (!handleSyncError({ message: errorText }, errorText)) {
                syncStatusSpan.textContent = errorText;
            }
        }
    } catch (e) {
        if (!handleSyncError(e, 'Backup error. Check console.')) {
            syncStatusSpan.textContent = 'Backup error. Check console.';
        }
    } finally {
        manualSyncBtn.disabled = false;
        backupInProgress = false;
    }
}
```

---

## Bug 3 (DROBNY): Drift harmonogramu tygodniowego pełnego backupu

### Opis problemu

7-dniowe okno liczone jest od `createdTime` pliku na GDrive (np. 15:43 dnia 0). Jeśli
następna sesja otwarta jest o 06:31 dnia 7, pełny backup nie odpali — trzeba poczekać do
>15:43. Obserwowane: pełny backup na March 31 o 15:43, następny na April 8 o 06:31 (8 dni).

### Zalecenie: brak zmian (akceptowalny drift)

Drift o kilkanaście godzin raz na 7 dni nie wpływa na bezpieczeństwo danych. Implementacja
alternatywna (np. `SIX_DAYS_MS`) zwiększałaby liczbę pełnych backupów bez realnej korzyści.
Ten bug można zaadresować w przyszłości jeśli użytkownik uzna go za istotny.

---

## Wsteczna kompatybilność: stare diff backupy (Format 1)

Stare diff backupy (pola `diff.tabs`, `diff.notes` itd.) nadal działają bez żadnej migracji.

**Logika detekcji w `applyDiff`:**
- `diffFormat === 2` w `_meta` → Format 2 (nowy, item-level)
- Klucz kończący się `_patch` → Format 2
- Żadne z powyższych → Format 1 (stary, sekcje)

Stare backupy na GDrive nie wymagają żadnych zmian — `applyDiff` obsługuje oba formaty.

---

## Lista zmian per-plik

### `uploader/sync.js`

| Zmiana | Lokalizacja |
|--------|-------------|
| Dodać `buildArrayPatch(oldArr, newArr)` | przed `calculateDiff` (ok. linia 26) |
| Zastąpić ciało `calculateDiff` nową implementacją (Format 2) | linie 26–65 |

### `domain/persistence/sync-backup.js`

| Zmiana | Lokalizacja |
|--------|-------------|
| Zastąpić `applyDiff` wersją z detekcją Format 1 vs 2 | linie 174–183 |
| Dodać `applyArrayPatch(baseArr, patch)` | zaraz po `applyDiff` |
| Dodać rate-limit (24h cooldown) w `triggerManualSync` | ok. linia 185 |
| Zmienić `lastAutoSync = Date.now()` → `lastManualSync = Date.now()` | ok. linia 206 |

### `domain/persistence/sync.js`

| Zmiana | Lokalizacja |
|--------|-------------|
| Dodać `let lastManualSync = null;` | ok. linia 20, obok `lastAutoSync` |
| Dodać `lastManualSync = settings.lastManualSync \|\| null;` w `loadSyncSettings()` | ok. linia 64 |
| Dodać `lastManualSync: lastManualSync` w `saveSyncSettings()` | ok. linia 83 |

### `prompts/knowledge/DATA_MODEL.md`

| Zmiana | Lokalizacja |
|--------|-------------|
| Dodać `lastManualSync` do schematu `speedDial_syncSettings` | sekcja Sync Settings |

---

## Checkista testów

### Bug 1: Item-level diff

- [ ] Edytuj jedną notatkę → uruchom backup → sprawdź plik `.diff.json` na GDrive →
      `notes_patch.upsert` zawiera tylko tę 1 notatkę; pozostałe nieobecne
- [ ] Dodaj nowy tab → diff zawiera `tabs_patch.upsert` z 1 tabem, nie ze wszystkimi
- [ ] Usuń todo-listę → diff zawiera `todoLists_patch.delete` z jej `id`
- [ ] Edytuj dial w istniejącym tabie → diff zawiera cały zmieniony tab (z nowym stanem diala), pozostałe taby nieobecne
- [ ] Nic nie zmieniono od ostatniego pełnego backup → diff jest niemal pusty (tylko `_type`, `_meta`)
- [ ] Odtwórz diff Format 2 → wszystkie dane poprawne (niezmienione items nienaruszone)
- [ ] Odtwórz stary diff Format 1 → dane nadal poprawnie odtwarzane (wsteczna kompatybilność)

### Bug 2: Rate-limiting ręcznych backupów

- [ ] Kliknij "Backup Now" → backup tworzony, `lastManualSync` ustawione, przycisk re-enabled
- [ ] Kliknij "Backup Now" ponownie w ciągu 24h → toast z informacją o cooldown, **brak** nowego pliku na GDrive
- [ ] Auto-backup (`checkAutoSync`) odpala się niezależnie od `lastManualSync`
- [ ] Manualny backup **nie** resetuje `lastAutoSync` — po odświeżeniu strony licznik auto działa poprawnie
- [ ] `lastManualSync` i `lastAutoSync` są obecne w `speedDial_syncSettings` w localStorage

### Bug 3: Tygodniowy pełny backup

- [ ] Potwierdzić, że pełny backup pojawia się raz na 7–8 dni (drift akceptowalny)

### Ogólne

- [ ] Nowe diff backupy są wyraźnie mniejsze od pełnych backupów przy małych zmianach
- [ ] Plik diff zawiera czytelne `notes_patch`, `tabs_patch` itd. (nie zbite tablice)
- [ ] Odtwarzanie pełnego backupu działa bez zmian
- [ ] Logi Node (`uploader`) nie pokazują błędów przy nowych diff backupach
- [ ] `cleanupOldBackups` nadal działa (max 50 plików)

---

## Uwagi implementacyjne

1. **Kolejność elementów w `applyArrayPatch`:** Zachowaj kolejność z tablicy bazowej.
   Nowe elementy (te z `upsert`, których `id` nie istnieje w `baseArr`) dołącz na końcu.
   Zapobiega to przeskakiwaniu pozycji notatek/tabów po odtworzeniu.

2. **Puste patche:** Jeśli sekcja nie zmieniła się, klucz `*_patch` jest całkowicie pomijany
   w diffie. `applyDiff` nie musi go obsługiwać — spread `{ ...fullData }` zachowuje sekcję nietkniętą.

3. **`_images` bez zmian:** Logika obrazów (`_images`) pozostaje identyczna — tylko nowe/zmienione
   obrazy trafiają do diffa. Usunięte obrazy NIE są śledzone w diffie (to istniejące zachowanie).

4. **Brak rekurencji w `tabs`:** Diff na poziomie tab-obiektu (łącznie z jego `groups[]`)
   jest wystarczający. Pełna rekurencja do `dials[]` byłaby nadmiarową złożonością.

5. **Cooldown UI dla "Backup Now":** Toast z informacją o cooldown (opcja minimalna).
   W przyszłości można wyszarzyć przycisk z tooltipem odliczającym czas do następnego backupu.

