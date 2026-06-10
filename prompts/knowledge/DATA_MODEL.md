# Data Model

localStorage key: `speedDial_v2`

```js
{
  tabs: [
    {
      id: string,         // uid()
      name: string,
      emoji: string,        // '' = no icon (explicit); undefined = old data, defaults to '🗂'
      isHome: boolean,      // true on the one non-deletable Start tab (always data.tabs[0])
      groups: [
        {
          id: string,
          name: string,
          emoji: string,      // '' = no icon (explicit); undefined = old data, gets random emoji
          dialSize: number,   // px, 60–400, default 140, controls --dial-size CSS var
          dials: [
            {
              id: string,
              name: string,
              url: string,
              emoji: string,
              iconType: 'favicon' | 'emoji' | 'custom' | 'none',
              icon: string,   // favicon URL, custom icon URL, or '' when iconType='none'
              visitCount: number, // incremented each time the dial is clicked; absent = 0
            }
          ]
        }
      ]
    }
  ]
}
```

## Sync Settings

localStorage key: `speedDial_syncSettings`

```js
{
  user: { email: string },      // Google user info (email)
  token: string | null,         // Google OAuth2 access token; null if disconnected/expired
  tokenExpiry: number | null,   // Timestamp (ms) of access token expiry
  folderId: string | null,      // Google Drive folder ID for backups
  tasksNotesListId: string | null, // Google Tasks list ID ("SDDR - Notes")
  autoSync: boolean,            // Daily auto-backup enabled? (default: false)
  showModalOnDisconnect: boolean, // Show Manage Data popup when account disconnected? (default: true)
  showStatusIndicators: boolean, // Show/hide State indicator dots in the header (default: true)
  showHeaderSearch: boolean,    // Show/hide header search input (default: true)
  showHeaderClock: boolean,     // Show/hide header clock/date column (default: true)
  lastAutoSync: number | null,   // Timestamp (ms) of last successful auto-backup
  lastManualSync: number | null, // Timestamp (ms) of last successful manual backup (rate-limited to 24h cooldown)
  // Note: lastBgSync is NOT stored here — it lives in its own localStorage key (see below)
  m365CalendarConfig: {
    enabled: boolean,            // Header M365 widget visibility
    icsUrl: string,              // Outlook ICS URL used as the only calendar source
    timezone: string,            // Optional timezone override for backend requests
  }
}
```

## Persistence
- `saveData()` → `localStorage.setItem('speedDial_v2', JSON.stringify(data))`
- `saveSyncSettings()` → `localStorage.setItem('speedDial_syncSettings', JSON.stringify({ ... }))`
- `speedDial_lastBgSync` — standalone `number` (ms timestamp); set by `triggerSync()` in `export.js` after each successful background backup. Separate from `speedDial_syncSettings` so it survives page reloads without going through `saveSyncSettings()`. Controls the 1-hour cooldown between automatic background backups.
- `loadData()` — migrates old `{ groups }` format automatically (no tabs wrapper); also ensures `data.tabs[0].isHome = true` if no tab has the flag yet
- `getActiveTab()` → returns current tab object from `data.tabs`

## Start / Home tab
- Exactly one tab has `isHome: true` — always `data.tabs[0]` after load
- Cannot be deleted (`deleteTab` blocks it; modal hides the Delete button)
- Can be renamed and have its emoji changed via the normal tab modal ("Edit Start Tab")
- Renders a "Frequently Used" widget view instead of groups
- `visitCount` on dials: incremented every time a dial card is clicked; dials with `visitCount > 0` appear on the Start tab, sorted highest first

## Todo Lists

`data.todoLists` — top-level array alongside `tabs`:

```js
todoLists: [
    {
        id: string,           // uid()
        name: string,
        emoji: string,        // '' = no icon
        createdAt: string,    // ISO 8601
        order: number,        // sorted ascending; drag-to-reorder
        items: [
            {
                id: string,       // uid()
                content: string,  // raw markdown; images as ![alt](/uploads/id.ext)
                isDone: boolean,
                createdAt: string,
                updatedAt: string,
                doneAt: string | null,
                order: number     // active items sort ascending; done items sort by doneAt desc
            }
        ]
    }
]
```

**Migration:** `loadData()` creates a default `{ name: 'TODO', emoji: '✅' }` list if `data.todoLists` is absent.

**Image refs:** Images in item content are stored as `![alt](/uploads/<id>.<ext>)` markdown. No separate `images[]` array. On item delete, `extractUploadIds(content)` scans for refs and `deleteDialImage()` removes them.

## Notes

`data.notes` — top-level array alongside `tabs` and `todoLists`:

```js
notes: [
    {
        id: string,               // uid()
        name: string,
        content: string,          // raw text; images as ![alt](/uploads/id.ext)
        language: string,         // markdown | text | json | javascript | etc.
        order: number,            // sorted ascending; drag-to-reorder
        createdAt: string,        // ISO 8601
        updatedAt: string,        // ISO 8601
        // Tasks Sync (opt-in)
        taskSync: boolean,        // true if note should sync to Google Tasks
        taskIds: string[],        // one or more Tasks IDs (chunked notes)
        taskLastSyncedAt: string | null, // ISO timestamp of last successful Tasks push/pull
        taskLocalDirty: boolean,  // true if edited locally after last sync
        taskConflict: boolean,    // true if both sides edited since last sync
    }
]
```

**Migration:** `loadData()` ensures `data.notes` exists; creates a default note if empty and backfills `task*` fields for older notes.

**Trash:** `data.notesTrash` stores deleted notes with `deletedAt: string` timestamp. Purged automatically after 30 days.

**Image refs:** Same as todo lists — markdown `![alt](/uploads/id.ext)`.

## Weather Config

localStorage key: `speedDial_weather`

```js
{
  enabled: boolean,            // Header weather widget visibility (default: true)
  city:  string | undefined,  // last city name entered by user (for pre-filling the form)
  lat:   number,              // geocoded or manually entered latitude
  lon:   number,              // geocoded or manually entered longitude
  label: string,              // display name (e.g. "Warsaw, Poland" or "52.229, 21.012")
  unit:  'C' | 'F'           // temperature unit (default 'C')
}
```

Weather data is fetched from Open-Meteo (no API key required) and cached in `_weatherData` (module var in `domain/weather/weather.js`). Cache TTL: 30 minutes.

## Monitored Pages

`data.monitoredPages` — top-level array alongside `tabs`, `todoLists`, and `notes`:

```js
monitoredPages: [
    {
        id:             string,         // uid()
        name:           string,         // display name (defaults to URL if blank)
        url:            string,         // full https:// URL to monitor
        interval:       number,         // check interval in minutes (15/30/60/180/360/1440)
        enabled:        boolean,        // false = monitoring paused
        useHeadless:    boolean,        // true = use headless Chromium (for JS-rendered SPAs)
        ignoredPhrases: string[],       // exact lines/phrases stripped before hashing
        lastChecked:    string | null,  // ISO timestamp of last successful check
        lastHash:       string | null,  // SHA-256 of cleaned content at last check; null before first check
        changed:        boolean,        // true if change detected since last acknowledgement
        lastChangedAt:  string | null,  // ISO timestamp when change was first detected
    }
]
```

**Per-page content** (separate localStorage keys, NOT in `speedDial_v2`):
- `speedDial_monCon_<id>_current` — cleaned page text from the last successful check
- `speedDial_monCon_<id>_prev` — cleaned text before the last detected change (used to build the diff view); cleared on acknowledge

**Migration:** `loadData()` ensures `data.monitoredPages` is an array (defaults to `[]`). `initMonitor()` also guards against missing array.

**Checking flow:**
1. Sidecar `POST /api/monitor/check { url, useHeadless }` returns `{ ok, hash, content }` where `content` is line-structured text (preserved newlines from `innerText` or block-tag conversion).
2. Frontend applies `_monitorApplyIgnored(content, ignoredPhrases)` — strips each phrase case-insensitively.
3. Hashes cleaned content with `crypto.subtle.digest('SHA-256', …)`.
4. If hash changed: saves prev content (`_prev`), updates current (`_current`), sets `changed = true`, fires `showNotification()`.

**Check intervals** (configurable per page):
- 15 minutes, 30 minutes, 1 hour, 3 hours, 6 hours, once a day
- Each page has its own `setInterval` timer managed by `_monitorTimers` (Map in `helpers.js`)
- Timers are rebuilt by `_rescheduleAllMonitors()` on app init and individually on add/edit/delete

**Export / Import / Backup:**
- `monitoredPages` is a top-level key in `data` → included automatically in **full JSON export** (`...data` spread in `getExportObject()`) and **full import** (`data = imported` in `_doImport()`).
- **Diff backups** (Google Drive): `calculateDiff()` in `uploader/sync.js` computes `monitoredPages_patch` using `buildArrayPatch()`. `applyDiff()` in `domain/persistence/sync-backup.js` applies `monitoredPages_patch` via `applyArrayPatch()`.
- The per-page content localStorage keys (`speedDial_monCon_<id>_*`) are NOT exported — they are ephemeral state rebuilt on the next check.

**Ignore workflow:**
- On change: user clicks 📋 to open the diff modal → sees added/removed lines.
- Clicking **Ignore** next to a line adds it to `ignoredPhrases`.
- `_monitorReapplyIgnored()` immediately re-strips stored content and auto-clears `changed` if the remaining diff is empty.
- Ignored phrases can be removed in the diff modal's "Ignored phrases" section.

---

## IDs
- Generated by `uid()` — `Date.now().toString(36) + random`, always `[a-z0-9]+`
- Todo image IDs include extension: `uid() + '.' + ext` (e.g. `lx3k9z2a.png`)
