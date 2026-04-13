# M365 Calendar - Unified Plan

## Goal
Build a 3-level meeting UX in header and keep one place for planning + testing assets.

1. Compact box (left of clock): next not-canceled meeting.
2. Click compact: agenda for next 5 working days.
3. Click agenda item: full meeting details.

Data must refresh periodically.

## Data Sources

### A) Primary: Microsoft Graph API
Use when tenant access and app registration are available.

- Auth: OAuth (Device Code for tests, backend token exchange for app)
- Endpoints planned in uploader:
  - `GET /api/m365/calendar/next`
  - `GET /api/m365/calendar/agenda?days=5&workingDays=true`
  - `GET /api/m365/calendar/event?eventId=...` (optional)

### B) Fallback: Outlook ICS feed
Use when Graph access/client_id is blocked by tenant policy.

- Input: published Outlook ICS URL
- Works read-only
- Supports next meeting + 5 working days agenda
- Includes recurrence expansion for `DAILY` and `WEEKLY`
- Includes SafeLinks cleanup for Teams URLs
- Limitations: caching delays, fewer metadata fields vs Graph

## UX Rules
- Next meeting: earliest event with `end >= now` and `isCancelled !== true`.
- Working days: Monday-Friday in configured timezone.
- Canceled meetings are excluded from compact and agenda views.
- In-progress meeting should still be eligible as next meeting.

## Refresh Strategy
- Compact widget refresh: every 60-120s.
- Agenda refresh: every 5 min + on open.
- Also refresh after regaining tab focus.

## Implementation Scope
- UI files:
  - `domain/ui/header.html`
  - `domain/ui/header.css`
- Frontend domain:
  - `domain/calendar/m365.js` (new)
- App bootstrap:
  - `index.html`
  - `domain/ui/init.js`
- Backend (Graph path):
  - `uploader/server.js`
  - `uploader/m365-auth.js` (new)
  - `uploader/m365-calendar.js` (new)

## Test Assets (kept in this folder)
- `prompts/plans/M365_CALENDAR/scripts/m365-verify.mjs` (Graph test)
- `prompts/plans/M365_CALENDAR/scripts/m365-verify-ics.mjs` (ICS fallback test)

## Acceptance Criteria
1. Compact box shows the correct next meeting.
2. Agenda shows next 5 working days.
3. Details view opens from agenda item click.
4. Periodic refresh updates data without reload.
5. Fallback ICS path works when Graph is unavailable.

