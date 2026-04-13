#!/usr/bin/env node

/**
 * Small helper script to validate Microsoft 365 Calendar API access via Device Code flow.
 *
 * Required env:
 * - M365_CLIENT_ID: App Registration client id
 * Optional env:
 * - M365_TENANT_ID: tenant id, default "organizations"
 * - M365_TIMEZONE: timezone for Graph responses, default "Europe/Warsaw"
 * - M365_WORK_DAYS: number of working days for agenda preview, default 5
 * - M365_SCOPE: custom scope string (space-separated)
 */

const HELP = `
Usage:
  M365_CLIENT_ID=<client-id> node scripts/m365-verify.mjs

Optional env vars:
  M365_TENANT_ID=organizations
  M365_TIMEZONE=Europe/Warsaw
  M365_WORK_DAYS=5
  M365_SCOPE="https://graph.microsoft.com/Calendars.Read offline_access openid profile"

What it does:
  1) Opens Device Code login flow (copy code, approve in browser).
  2) Fetches meetings from Microsoft Graph calendarView.
  3) Prints next not-canceled meeting.
  4) Prints agenda grouped by next N working days.
`;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(HELP.trim());
    process.exit(0);
}

const clientId = process.env.M365_CLIENT_ID;
const tenantId = process.env.M365_TENANT_ID || 'organizations';
const timezone = process.env.M365_TIMEZONE || 'Europe/Warsaw';
const workDaysCount = Math.max(1, Number(process.env.M365_WORK_DAYS || 5));
const scope = process.env.M365_SCOPE || 'https://graph.microsoft.com/Calendars.Read offline_access openid profile';

if (!clientId) {
    console.error('[m365-verify] Missing required env: M365_CLIENT_ID');
    console.error('Run with --help for setup details.');
    process.exit(1);
}

const authBase = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0`;
const graphBase = 'https://graph.microsoft.com/v1.0';

function isoNow() {
    return new Date().toISOString();
}

function isoDaysFromNow(days) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString();
}

function parseGraphDateTime(dtObj) {
    if (!dtObj?.dateTime) return null;
    const raw = dtObj.dateTime;
    if (raw.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(raw)) return new Date(raw);
    return new Date(`${raw}Z`);
}

function durationMinutes(start, end) {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function formatDuration(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
}

function formatTime(date) {
    return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: timezone,
    }).format(date);
}

function formatDay(date) {
    return new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: timezone,
    }).format(date);
}

function isWorkingDay(date) {
    const day = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        timeZone: timezone,
    }).format(date);
    return day !== 'Sat' && day !== 'Sun';
}

async function postForm(url, formData) {
    const body = new URLSearchParams(formData);
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = json.error_description || json.error || `HTTP ${res.status}`;
        throw new Error(msg);
    }
    return json;
}

async function startDeviceCodeFlow() {
    const deviceCode = await postForm(`${authBase}/devicecode`, {
        client_id: clientId,
        scope,
    });

    console.log('=== Microsoft login required ===');
    console.log(deviceCode.message || `Open ${deviceCode.verification_uri} and use code ${deviceCode.user_code}`);
    console.log('');

    const intervalMs = Math.max(1, Number(deviceCode.interval || 5)) * 1000;
    const expiresAt = Date.now() + Number(deviceCode.expires_in || 900) * 1000;

    while (Date.now() < expiresAt) {
        await new Promise(r => setTimeout(r, intervalMs));
        try {
            const token = await postForm(`${authBase}/token`, {
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                client_id: clientId,
                device_code: deviceCode.device_code,
            });
            if (token.access_token) return token;
        } catch (e) {
            const msg = String(e.message || '');
            if (msg.includes('authorization_pending')) continue;
            if (msg.includes('slow_down')) {
                await new Promise(r => setTimeout(r, intervalMs));
                continue;
            }
            throw e;
        }
    }

    throw new Error('Device code flow timed out.');
}

async function fetchCalendarWindow(accessToken, startIso, endIso) {
    const url = new URL(`${graphBase}/me/calendarView`);
    url.searchParams.set('startDateTime', startIso);
    url.searchParams.set('endDateTime', endIso);
    url.searchParams.set('$orderby', 'start/dateTime');
    url.searchParams.set('$top', '200');
    url.searchParams.set('$select', [
        'id',
        'subject',
        'isCancelled',
        'isAllDay',
        'start',
        'end',
        'organizer',
        'location',
        'onlineMeetingUrl',
        'webLink',
        'responseStatus',
        'attendees',
        'bodyPreview',
    ].join(','));

    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Prefer: `outlook.timezone="${timezone}"`,
        },
    });

    const json = await res.json();
    if (!res.ok) {
        throw new Error(json?.error?.message || `Graph HTTP ${res.status}`);
    }
    return Array.isArray(json.value) ? json.value : [];
}

function normalizeEvent(ev) {
    const start = parseGraphDateTime(ev.start);
    const end = parseGraphDateTime(ev.end);
    if (!start || !end) return null;

    return {
        id: ev.id,
        subject: ev.subject || '(no subject)',
        isCancelled: !!ev.isCancelled,
        isAllDay: !!ev.isAllDay,
        start,
        end,
        organizer: ev.organizer?.emailAddress?.name || ev.organizer?.emailAddress?.address || '',
        location: ev.location?.displayName || '',
        joinUrl: ev.onlineMeetingUrl || '',
        webLink: ev.webLink || '',
        response: ev.responseStatus?.response || 'none',
        attendeesCount: Array.isArray(ev.attendees) ? ev.attendees.length : 0,
        bodyPreview: ev.bodyPreview || '',
    };
}

function pickNextNotCanceled(events) {
    const now = Date.now();
    return events
        .filter(e => !e.isCancelled)
        .filter(e => e.end.getTime() >= now)
        .sort((a, b) => a.start - b.start)[0] || null;
}

function buildWorkingDaysAgenda(events, daysCount) {
    const grouped = new Map();
    const now = new Date();

    for (const ev of events) {
        if (ev.isCancelled) continue;
        if (ev.end < now) continue;
        if (!isWorkingDay(ev.start)) continue;

        const key = formatDay(ev.start);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(ev);
    }

    const days = [...grouped.entries()]
        .sort((a, b) => a[1][0].start - b[1][0].start)
        .slice(0, daysCount)
        .map(([day, items]) => ({ day, items: items.sort((a, b) => a.start - b.start) }));

    return days;
}

function printNextMeeting(next) {
    console.log('=== Next not-canceled meeting ===');
    if (!next) {
        console.log('No upcoming meetings found.');
        console.log('');
        return;
    }

    const dur = durationMinutes(next.start, next.end);
    console.log(`Subject   : ${next.subject}`);
    console.log(`Time      : ${formatTime(next.start)} - ${formatTime(next.end)} (${formatDuration(dur)})`);
    console.log(`Organizer : ${next.organizer || '-'}`);
    console.log(`Location  : ${next.location || '-'}`);
    console.log(`Join URL  : ${next.joinUrl || '-'}`);
    console.log(`Web link  : ${next.webLink || '-'}`);
    console.log('');
}

function printAgenda(days) {
    console.log(`=== Agenda (next ${workDaysCount} working days) ===`);
    if (!days.length) {
        console.log('No meetings in working-day window.');
        console.log('');
        return;
    }

    for (const d of days) {
        console.log(`\n${d.day}`);
        for (const ev of d.items) {
            const dur = durationMinutes(ev.start, ev.end);
            console.log(`  - ${formatTime(ev.start)}-${formatTime(ev.end)} (${formatDuration(dur)}) | ${ev.subject}`);
        }
    }
    console.log('');
}

async function main() {
    console.log('[m365-verify] Starting login flow...');
    const token = await startDeviceCodeFlow();
    if (!token.access_token) throw new Error('No access token received.');

    const startIso = isoNow();
    const endIso = isoDaysFromNow(14);
    const rawEvents = await fetchCalendarWindow(token.access_token, startIso, endIso);
    const events = rawEvents.map(normalizeEvent).filter(Boolean);

    const next = pickNextNotCanceled(events);
    const agenda = buildWorkingDaysAgenda(events, workDaysCount);

    console.log('[m365-verify] API call successful.');
    console.log(`Fetched events: ${events.length}`);
    console.log('');
    printNextMeeting(next);
    printAgenda(agenda);

    if (token.refresh_token) {
        console.log('Refresh token received: yes (offline_access works)');
    } else {
        console.log('Refresh token received: no (check app settings + offline_access scope)');
    }
}

main().catch((err) => {
    console.error('\n[m365-verify] Failed:', err.message || err);
    process.exit(1);
});

