# M365 Calendar Working Folder

This directory keeps M365 calendar planning and test scripts in one place.

## Files
- `PLAN.md` - implementation plan (Graph + ICS fallback)
- `scripts/m365-verify.mjs` - Graph login/API verifier (requires `M365_CLIENT_ID`)
- `scripts/m365-verify-ics.mjs` - ICS fallback verifier (requires `M365_ICS_URL`)

## Quick Run (Graph)
```bash
M365_CLIENT_ID="<client-id>" node prompts/plans/M365_CALENDAR/scripts/m365-verify.mjs
```

Optional env:
- `M365_TENANT_ID` (default `organizations`)
- `M365_TIMEZONE` (default `Europe/Warsaw`)
- `M365_WORK_DAYS` (default `5`)
- `M365_SCOPE`

## Quick Run (ICS fallback)
```bash
M365_ICS_URL="https://.../calendar.ics" node prompts/plans/M365_CALENDAR/scripts/m365-verify-ics.mjs
```

JSON mode:
```bash
M365_ICS_URL="https://.../calendar.ics" node prompts/plans/M365_CALENDAR/scripts/m365-verify-ics.mjs --json
```

Optional env:
- `M365_TIMEZONE` (default `Europe/Warsaw`)
- `M365_WORK_DAYS` (default `5`)

