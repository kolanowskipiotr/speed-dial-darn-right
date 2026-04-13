# M365 Meetings in Header (Updated Plan v2)

## Goal
Implement a 3-level meeting UX in header:
1. Compact box (left of clock): show next not canceled meeting.
2. On compact box click: show agenda list for next 5 working days.
3. On list item click: show full details for that meeting.

Meeting data should refresh periodically.

## Final UX Behavior

### Level 1: Compact box (header, left of clock)
Shows only:
- start time
- duration
- subject (truncated)

Data rule:
- first upcoming meeting where isCancelled !== true
- if no meeting: show No upcoming meetings
- if disconnected/error/loading: show status variant

### Level 2: Agenda list (on compact box click)
Shows:
- meetings for next 5 working days (Mon-Fri in configured timezone)
- grouped by day
- canceled meetings excluded
- each row: time range + subject + short meta (organizer/location optional)

### Level 3: Meeting details (on agenda row click)
Shows full available fields from Graph payload:
- subject
- start/end + timezone
- organizer
- location
- online join link
- Outlook event link
- attendees summary
- response status
- body preview

## Data and API Contract

### Backend endpoints (uploader)
- GET /api/m365/calendar/next
- GET /api/m365/calendar/agenda?days=5&workingDays=true
- GET /api/m365/calendar/event?eventId=... (optional)

### Recommended normalization
Each meeting item:
- id
- subject
- start
- end
- timezone
- durationMinutes
- isCancelled
- isAllDay
- organizer { name, email }
- location
- joinUrl
- webLink
- responseStatus
- attendeesCount
- bodyPreview

## Refresh Strategy (periodic updates)
- Compact (next) refresh: every 60-120 seconds.
- Agenda refresh: every 5 minutes (and on open).
- Manual refresh triggers:
  - after reconnect/auth success
  - after tab regains focus (visibilitychange)
- Optional: backoff on API throttling/errors (429).

## Implementation Plan by Files

### 1) UI structure
Files:
- domain/ui/header.html
- domain/ui/header.css

Tasks:
- Add compact meeting box before header-time-col.
- Add agenda modal/popover structure.
- Add meeting details modal structure.
- Ensure keyboard accessibility and focus handling.

### 2) Frontend domain
New file:
- domain/calendar/m365.js

Tasks:
- initM365Meeting()
- fetch compact next meeting
- fetch agenda (5 working days)
- render compact, agenda, and details views
- periodic refresh timers
- click handlers (compact -> agenda, row -> details)

### 3) App bootstrap
Files:
- index.html
- domain/ui/init.js

Tasks:
- include domain/calendar/m365.js before domain/ui/init.js
- call initM365Meeting() with guard

### 4) Uploader backend
Files:
- uploader/server.js
- uploader/m365-auth.js (new)
- uploader/m365-calendar.js (new)
- uploader/package.json

Tasks:
- add/confirm Microsoft auth flow + refresh token
- implement /next and /agenda endpoints
- apply filtering:
  - exclude canceled
  - return next 5 working days window

## Business Rules
- Working days = Monday-Friday in configured timezone.
- Next meeting = earliest meeting with end time >= now and not canceled.
- In-progress meeting should be marked in compact box.
- Canceled meetings are never shown in compact or agenda.

## Acceptance Criteria
1. Compact box shows next non-canceled meeting left of clock.
2. Clicking compact opens next-5-working-days agenda.
3. Clicking agenda row opens full meeting details.
4. Data auto-refreshes periodically without reload.
5. Header layout and existing weather/clock/search remain stable.
6. Empty/error/disconnected states are readable and non-breaking.

## Test Plan
- next selection skips canceled entries
- timezone/day-boundary coverage
- agenda includes exactly next 5 working days window
- compact refresh timer updates UI
- agenda refresh on open and periodic timer
- modal open/close and keyboard accessibility
- API error/throttling behavior

