# M365 Testing & Docs

Dokumentacja i artefakty testowe dla M365 Calendar integration.

## Source Files (w `scripts/`)
Oryginały są w głównym folderze `scripts/`:
- `scripts/m365-verify.mjs` — Graph API verifier
- `scripts/m365-verify-ics.mjs` — ICS fallback verifier
- `scripts/bundle.mjs` — build skrypt (bez zmian)
- `scripts/package.json` — zależności (bez zmian)
- `scripts/README_M365_VERIFY.md` — oryginalna dokumentacja

## Copies (tutaj, w `prompts/plans/M365_CALENDAR/`)
Kopie do konsultacji razem z planem:
- `scripts/m365-verify.mjs` — snapshot dla referencji
- `scripts/m365-verify-ics.mjs` — snapshot dla referencji

## When to Update Copies
Jeśli zmienisz oryginały w `scripts/`, zaktualizuj też kopie tutaj.

## Quick Test Commands
```bash
# Graph (wymaga Azure App Registration)
cd /Users/pkolanow/private-workspace/speed-dial-darn-right
M365_CLIENT_ID="<client-id>" node scripts/m365-verify.mjs

# ICS fallback (wymaga published Outlook calendar)
M365_ICS_URL="<ics-url>" npm run m365:verify:ics

# JSON output (dla integracji)
M365_ICS_URL="<ics-url>" node scripts/m365-verify-ics.mjs --json
```

## Important Notes
- Kopie w tym folderze są **dokumentacyjne**; źródła prawdy są w `scripts/`.
- `npm run` komendy (`npm run m365:verify:ics`) sięgają do `scripts/` automatycznie.
- Jeśli zmienisz zachowanie w `scripts/*.mjs`, pamiętaj by zaktualizować kopie tutaj.

