# M365 API Verify Script

Quick local script to validate Microsoft 365 calendar access via Device Code flow.

## File
- `scripts/m365-verify.mjs`

## Requirements
- Node.js 18+
- Azure App Registration with delegated permission `Calendars.Read`
- Public client flow enabled (Device Code)

## Run
```bash
M365_CLIENT_ID="<your-app-client-id>" node scripts/m365-verify.mjs
```

Optional env vars:
- `M365_TENANT_ID` (default: `organizations`)
- `M365_TIMEZONE` (default: `Europe/Warsaw`)
- `M365_WORK_DAYS` (default: `5`)
- `M365_SCOPE` (default includes `Calendars.Read offline_access openid profile`)

## What you should see
- Login instruction with code and verification URL
- Number of fetched events
- Next not-canceled meeting summary
- Agenda preview for next N working days
- Whether refresh token was returned

## Fallback Without client_id (ICS)

If you cannot get Azure App Registration access, use the public Outlook ICS link.

1. In Outlook/OWA, publish your calendar and copy the `.ics` URL.
2. Run:

```bash
M365_ICS_URL="https://.../calendar.ics" node scripts/m365-verify-ics.mjs
```

Or via npm:

```bash
M365_ICS_URL="https://.../calendar.ics" npm run m365:verify:ics
```

Optional env vars:
- `M365_TIMEZONE` (default: `Europe/Warsaw`)
- `M365_WORK_DAYS` (default: `5`)

Notes:
- ICS is read-only and can be delayed due to server-side caching.
- Some metadata (attendees/response/join link) may be missing compared to Graph API.
