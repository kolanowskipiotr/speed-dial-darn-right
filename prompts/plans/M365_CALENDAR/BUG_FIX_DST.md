# Bug Fix: Recurring Event Expansion with DST Transitions

## Problem
When expanding recurring events (RRULE with FREQ=WEEKLY and INTERVAL > 1) that span Daylight Saving Time (DST) transitions, events were incorrectly added to dates that should NOT match the recurrence pattern.

### Example
- Meeting: "Monthly Sprints Review" (WEEKLY, INTERVAL=4, BYDAY=FR)
- Start: Friday, Feb 13, 2026
- Should repeat every 4 weeks on Friday: Feb 13, Mar 13, Apr 10, …
- **Bug**: Apr 17 (Friday, 9 weeks from start) was also included (should be 10 weeks, not divisible by 4)

### Root Cause
The function `expandRecurringEvents()` calculated day differences using:
```javascript
const diffDays = Math.floor((toDateOnlyLocal(day) - startDay) / 86400000);
```

**Problem**: `toDateOnlyLocal()` creates dates in LOCAL timezone, then subtraction happens in UTC. When spanning DST (e.g., UTC+1 in Feb to UTC+2 in Apr), the millisecond difference is off by 1 hour, causing day calculations to misalign:

- Feb 13 00:00 local (UTC+1) = Feb 12 23:00 UTC
- Apr 17 00:00 local (UTC+2) = Apr 16 22:00 UTC
- Difference: 62 days instead of 63 → `weeks = 8` (matches interval=4) ✗ **Wrong!**

## Solution
Use `Date.UTC()` for both dates to eliminate timezone/DST ambiguity:

```javascript
function getDayDifferenceUTC(date1, date2) {
    const utc1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const utc2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.floor((utc2 - utc1) / 86400000);
}
```

This ensures:
- Feb 13 → Date.UTC(2026, 1, 13) = Feb 13 00:00 UTC
- Apr 17 → Date.UTC(2026, 3, 17) = Apr 17 00:00 UTC
- Difference: **63 days** → `weeks = 9` → `9 % 4 = 1` ✓ **Correct!**

## Changes Made
- **File**: `uploader/m365-calendar.js`
- **Added**: `getDayDifferenceUTC()` helper function
- **Updated**: `expandRecurringEvents()` to use `getDayDifferenceUTC()` instead of local timezone math

## Testing
- All 60 existing tests pass
- Manual verification: Feb 13 → Mar 13 (4 weeks ✓) → Apr 10 (8 weeks ✓) → Apr 17 (9 weeks ✗ correctly excluded)

## Notes
- Fix applies only to FREQ=WEEKLY with INTERVAL > 1
- FREQ=DAILY recurrence unaffected (counts days directly)
- Works correctly across all timezones and DST transitions

