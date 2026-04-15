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

---

## IDs
- Generated by `uid()` — `Date.now().toString(36) + random`, always `[a-z0-9]+`
- Todo image IDs include extension: `uid() + '.' + ext` (e.g. `lx3k9z2a.png`)
