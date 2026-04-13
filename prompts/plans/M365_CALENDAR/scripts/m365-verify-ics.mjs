#!/usr/bin/env node

/**
 * Fallback M365 calendar verifier using a public ICS feed.
 * No Azure App Registration or client_id required.
 *
 * Required env:
 * - M365_ICS_URL: public calendar ICS URL (Outlook "Publish calendar")
 * Optional env:
 * - M365_TIMEZONE: output timezone, default "Europe/Warsaw"
 * - M365_WORK_DAYS: number of working days to print, default 5
 */

const HELP = `
Usage:
  M365_ICS_URL="https://.../calendar.ics" node scripts/m365-verify-ics.mjs
  M365_ICS_URL="https://.../calendar.ics" node scripts/m365-verify-ics.mjs --json

Optional env vars:
  M365_TIMEZONE=Europe/Warsaw
  M365_WORK_DAYS=5

What it does:
  1) Downloads and parses ICS events.
  2) Prints next not-canceled meeting.
  3) Prints agenda grouped by next N working days.
`;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(HELP.trim());
    process.exit(0);
}

const icsUrl = process.env.M365_ICS_URL;
const timezone = process.env.M365_TIMEZONE || 'Europe/Warsaw';
const workDaysCount = Math.max(1, Number(process.env.M365_WORK_DAYS || 5));
const jsonMode = process.argv.includes('--json');

if (!icsUrl) {
    console.error('[m365-verify-ics] Missing required env: M365_ICS_URL');
    console.error('Run with --help for setup details.');
    process.exit(1);
}

function unfoldIcs(raw) {
    return raw.replace(/\r?\n[ \t]/g, '');
}

function parseLine(line) {
    const idx = line.indexOf(':');
    if (idx < 0) return null;
    const lhs = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name, ...paramParts] = lhs.split(';');
    const params = {};
    for (const p of paramParts) {
        const eq = p.indexOf('=');
        if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
    }
    return { name: name.toUpperCase(), value, params };
}

function parseIcsDate(raw, params) {
    if (!raw) return null;
    const valueType = params?.VALUE || '';
    if (valueType === 'DATE' || /^\d{8}$/.test(raw)) {
        const y = Number(raw.slice(0, 4));
        const m = Number(raw.slice(4, 6));
        const d = Number(raw.slice(6, 8));
        return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    }

    const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/);
    if (!match) return null;

    const [, y, mo, d, h, mi, s = '00', z] = match;
    if (z === 'Z') {
        return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
    }

    // Floating datetime (or TZID-based in ICS): interpret as local clock time.
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

function parseRRule(raw = '') {
    if (!raw) return null;
    const out = {};
    for (const part of raw.split(';')) {
        const idx = part.indexOf('=');
        if (idx < 0) continue;
        out[part.slice(0, idx).toUpperCase()] = part.slice(idx + 1);
    }
    return out;
}

function toDateOnlyLocal(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDays(d, n) {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + n);
    return copy;
}

function toOccurrenceKey(uid, date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${uid}|${y}-${m}-${d}T${hh}:${mm}`;
}

function parseExDates(raw = '', params = {}) {
    if (!raw) return [];
    return raw
        .split(',')
        .map((v) => parseIcsDate(v.trim(), params))
        .filter(Boolean);
}

function unescapeIcsText(v = '') {
    return v
        .replace(/\\n/gi, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');
}

function stripUrlNoise(raw = '') {
    return raw
        .trim()
        .replace(/^<+/, '')
        .replace(/>+$/, '')
        .replace(/[),.;]+$/, '');
}

function decodeSafeLink(rawUrl = '') {
    const cleaned = stripUrlNoise(rawUrl);
    if (!cleaned) return '';

    try {
        const u = new URL(cleaned);
        if (!u.hostname.includes('safelinks.protection.outlook.com')) return cleaned;
        const target = u.searchParams.get('url');
        return target ? stripUrlNoise(target) : cleaned;
    } catch {
        return cleaned;
    }
}

function extractJoinUrl(description = '', urlProp = '') {
    const links = description.match(/https?:\/\/[^\s<>")]+/gi) || [];
    const decodedLinks = links.map(decodeSafeLink);
    const directTeams = decodedLinks.find((l) => /^https:\/\/teams\.microsoft\.com\//i.test(l));
    if (directTeams) return directTeams;

    const decodedUrlProp = decodeSafeLink(urlProp);
    if (/^https:\/\/teams\.microsoft\.com\//i.test(decodedUrlProp)) return decodedUrlProp;

    return decodedUrlProp || decodedLinks[0] || '';
}

function parseEvents(rawIcs) {
    const lines = unfoldIcs(rawIcs).split(/\r?\n/);
    const events = [];
    let ev = null;

    for (const line of lines) {
        if (line === 'BEGIN:VEVENT') {
            ev = { raw: {} };
            continue;
        }
        if (line === 'END:VEVENT') {
            if (ev) events.push(ev);
            ev = null;
            continue;
        }
        if (!ev) continue;

        const parsed = parseLine(line);
        if (!parsed) continue;
        const { name, value, params } = parsed;
        ev.raw[name] = { value, params };
    }

    return events
        .map((e) => {
            const start = parseIcsDate(e.raw.DTSTART?.value, e.raw.DTSTART?.params);
            const end = parseIcsDate(e.raw.DTEND?.value, e.raw.DTEND?.params) || start;
            if (!start || !end) return null;

            const description = unescapeIcsText(e.raw.DESCRIPTION?.value || '');
            const urlProp = unescapeIcsText(e.raw.URL?.value || '');
            const joinUrl = extractJoinUrl(description, urlProp);
            const recurrenceId = parseIcsDate(e.raw['RECURRENCE-ID']?.value, e.raw['RECURRENCE-ID']?.params);

            return {
                id: unescapeIcsText(e.raw.UID?.value || ''),
                subject: unescapeIcsText(e.raw.SUMMARY?.value || '(no subject)'),
                start,
                end,
                recurrenceId,
                rrule: parseRRule(e.raw.RRULE?.value || ''),
                exdates: parseExDates(e.raw.EXDATE?.value || '', e.raw.EXDATE?.params || {}),
                isCancelled: (e.raw.STATUS?.value || '').toUpperCase() === 'CANCELLED',
                location: unescapeIcsText(e.raw.LOCATION?.value || ''),
                bodyPreview: description.slice(0, 280),
                webLink: urlProp,
                joinUrl,
                organizer: unescapeIcsText(e.raw.ORGANIZER?.value || ''),
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.start - b.start);
}

function expandRecurringEvents(events, fromDate, horizonDays = 60) {
    const windowStart = new Date(fromDate);
    const windowEnd = addDays(windowStart, horizonDays);

    const explicit = events.filter((e) => !!e.recurrenceId);
    const explicitKeys = new Set(explicit.map((e) => toOccurrenceKey(e.id, e.start)));

    const result = events.filter((e) => !e.rrule || e.recurrenceId);

    for (const master of events) {
        if (!master.rrule || master.recurrenceId) continue;

        const freq = (master.rrule.FREQ || '').toUpperCase();
        if (freq !== 'DAILY' && freq !== 'WEEKLY') continue;

        const interval = Math.max(1, Number(master.rrule.INTERVAL || 1));
        const byDay = (master.rrule.BYDAY || '')
            .split(',')
            .map((x) => x.trim().toUpperCase())
            .filter(Boolean);

        const until = parseIcsDate(master.rrule.UNTIL || '', {});
        const rangeEnd = until && until < windowEnd ? until : windowEnd;
        const startDay = toDateOnlyLocal(master.start);
        const iterStart = toDateOnlyLocal(master.start > windowStart ? master.start : windowStart);

        for (let day = new Date(iterStart); day <= rangeEnd; day = addDays(day, 1)) {
            const diffDays = Math.floor((toDateOnlyLocal(day) - startDay) / 86400000);
            if (diffDays < 0) continue;

            let matches = false;
            if (freq === 'DAILY') {
                matches = diffDays % interval === 0;
            } else {
                const jsDay = day.getDay();
                const iCalDay = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][jsDay];
                const wantedDays = byDay.length ? byDay : [['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][master.start.getDay()]];
                const diffWeeks = Math.floor(diffDays / 7);
                matches = diffWeeks % interval === 0 && wantedDays.includes(iCalDay);
            }
            if (!matches) continue;

            const occStart = new Date(
                day.getFullYear(),
                day.getMonth(),
                day.getDate(),
                master.start.getHours(),
                master.start.getMinutes(),
                master.start.getSeconds()
            );
            const occEnd = new Date(occStart.getTime() + (master.end.getTime() - master.start.getTime()));
            if (occEnd < windowStart) continue;

            const excluded = master.exdates.some((x) => x.getTime() === occStart.getTime());
            if (excluded) continue;

            const key = toOccurrenceKey(master.id, occStart);
            if (explicitKeys.has(key)) continue;

            result.push({
                ...master,
                start: occStart,
                end: occEnd,
                recurrenceId: occStart,
                rrule: null,
            });
        }
    }

    return result.sort((a, b) => a.start - b.start);
}

function isWorkingDay(date) {
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone }).format(date);
    return day !== 'Sat' && day !== 'Sun';
}

function formatTime(date) {
    return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
    }).format(date);
}

function formatDay(date) {
    return new Intl.DateTimeFormat('en-GB', {
        weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone,
    }).format(date);
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

function pickNextNotCanceled(events) {
    const now = Date.now();
    return events.find((e) => !e.isCancelled && e.end.getTime() >= now) || null;
}

function buildWorkingDaysAgenda(events, daysCount) {
    const now = new Date();
    const grouped = new Map();

    for (const ev of events) {
        if (ev.isCancelled || ev.end < now || !isWorkingDay(ev.start)) continue;
        const key = formatDay(ev.start);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(ev);
    }

    return [...grouped.entries()]
        .slice(0, daysCount)
        .map(([day, items]) => ({ day, items }));
}

function printNext(next) {
    console.log('=== Next not-canceled meeting (ICS) ===');
    if (!next) {
        console.log('No upcoming meetings found.\n');
        return;
    }

    const dur = durationMinutes(next.start, next.end);
    console.log(`Subject   : ${next.subject}`);
    console.log(`Time      : ${formatTime(next.start)} - ${formatTime(next.end)} (${formatDuration(dur)})`);
    console.log(`Location  : ${next.location || '-'}`);
    console.log(`Join URL  : ${next.joinUrl || '-'}`);
    console.log('');
}

function printAgenda(days) {
    console.log(`=== Agenda (next ${workDaysCount} working days, ICS) ===`);
    if (!days.length) {
        console.log('No meetings in working-day window.\n');
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

function toJsonEvent(ev) {
    if (!ev) return null;
    return {
        id: ev.id,
        subject: ev.subject,
        start: ev.start.toISOString(),
        end: ev.end.toISOString(),
        isCancelled: ev.isCancelled,
        location: ev.location,
        joinUrl: ev.joinUrl,
        webLink: ev.webLink,
        organizer: ev.organizer,
        bodyPreview: ev.bodyPreview,
    };
}

async function main() {
    if (!jsonMode) console.log('[m365-verify-ics] Downloading ICS...');
    const res = await fetch(icsUrl);
    if (!res.ok) throw new Error(`ICS HTTP ${res.status}`);

    const raw = await res.text();
    const parsed = parseEvents(raw);
    const events = expandRecurringEvents(parsed, new Date(), 90);
    const next = pickNextNotCanceled(events);
    const agenda = buildWorkingDaysAgenda(events, workDaysCount);

    if (jsonMode) {
        const payload = {
            parsedEvents: events.length,
            next: toJsonEvent(next),
            agenda: agenda.map((d) => ({
                day: d.day,
                items: d.items.map(toJsonEvent),
            })),
        };
        console.log(JSON.stringify(payload, null, 2));
        return;
    }

    console.log(`[m365-verify-ics] Parsed events: ${events.length}\n`);
    printNext(next);
    printAgenda(agenda);
}

main().catch((err) => {
    console.error('\n[m365-verify-ics] Failed:', err.message || err);
    process.exit(1);
});

