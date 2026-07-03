function unfoldIcs(raw) {
    return String(raw || '').replace(/\r?\n[ \t]/g, '');
}

function parseLine(line) {
    // Find the first colon that is NOT inside a quoted string.
    // This is required because TZID parameters can contain colons, e.g.:
    //   DTSTART;TZID="(UTC+01:00) Sarajevo, Skopje, Warsaw, Zagreb":20260505T113000
    // A naive indexOf(':') would split at the colon inside the timezone name.
    let inQuote = false;
    let idx = -1;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuote = !inQuote; }
        else if (ch === ':' && !inQuote) { idx = i; break; }
    }
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

// windows-iana maps Windows KEY timezone names (e.g. "Central Europe Standard Time")
// to IANA identifiers. Covers all ~130 Windows zones — replaces any hand-written map.
const { findIana: _findIana } = require('windows-iana');

// Return the first IANA timezone for a Windows KEY name, or '' if unknown.
function _winKeyToIana(name) {
    try {
        const results = _findIana(String(name || ''));
        return (results && results[0]) || '';
    } catch {
        return '';
    }
}

// Parse a TZOFFSETFROM/TZOFFSETTO value like "+0200" or "-0530" into minutes.
function _parseIcsOffsetToMinutes(raw = '') {
    const m = String(raw).trim().match(/^([+-])(\d{2})(\d{2})$/);
    if (!m) return null;
    const sign = m[1] === '+' ? 1 : -1;
    return sign * (Number(m[2]) * 60 + Number(m[3]));
}

// Try to find a valid IANA zone name from an Etc/GMT±N fixed-offset.
// Used as last-resort fallback when VTIMEZONE is absent and TZID is a display name.
function _offsetMinutesToEtcGmt(offsetMinutes) {
    if (offsetMinutes === null) return '';
    // Etc/GMT uses the POSIX sign convention (inverted): Etc/GMT-2 = UTC+2
    const hours = offsetMinutes / 60;
    if (!Number.isInteger(hours)) return ''; // can't express sub-hour in Etc/GMT
    const etcSign = hours >= 0 ? '-' : '+';
    const etcHours = Math.abs(hours);
    const candidate = `Etc/GMT${etcSign}${etcHours}`;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
        return candidate;
    } catch {
        return '';
    }
}

// Parse all VTIMEZONE blocks in the ICS and return a map: tzid → { iana, stdOffsetMin, dstOffsetMin }.
// Outlook always includes VTIMEZONE for every unique timezone it uses so this
// covers all events without a static 120-entry timezone dictionary.
function parseVTimezones(lines) {
    // map: tzid → { iana: string|null, stdOffsetMin: number|null, dstOffsetMin: number|null }
    const map = {};
    let inVtz = false;
    let subType = null; // 'std' | 'dst' | null
    let tzid = null;
    let stdOffsetMin = null;
    let dstOffsetMin = null;

    for (const line of lines) {
        const s = line.trim();
        if (s === 'BEGIN:VTIMEZONE') { inVtz = true; tzid = null; stdOffsetMin = null; dstOffsetMin = null; continue; }
        if (s === 'END:VTIMEZONE') {
            if (tzid) {
                let iana = '';
                try { new Intl.DateTimeFormat('en-US', { timeZone: tzid }).format(new Date()); iana = tzid; } catch { /* */ }
                if (!iana) iana = _winKeyToIana(tzid);
                // Store iana (may be empty), stdOffsetMin and dstOffsetMin for fallback matching
                map[tzid] = { iana: iana || null, stdOffsetMin, dstOffsetMin };
            }
            inVtz = false; tzid = null; subType = null; stdOffsetMin = null; dstOffsetMin = null;
            continue;
        }
        if (!inVtz) continue;
        if (s === 'BEGIN:STANDARD') { subType = 'std'; continue; }
        if (s === 'BEGIN:DAYLIGHT') { subType = 'dst'; continue; }
        if (s === 'END:STANDARD' || s === 'END:DAYLIGHT') { subType = null; continue; }

        const parsed = parseLine(s);
        if (!parsed) continue;
        if (!subType && parsed.name === 'TZID') {
            tzid = unescapeIcsText(parsed.value).trim();
        } else if (subType === 'std' && parsed.name === 'TZOFFSETTO') {
            stdOffsetMin = _parseIcsOffsetToMinutes(parsed.value);
        } else if (subType === 'dst' && parsed.name === 'TZOFFSETTO') {
            dstOffsetMin = _parseIcsOffsetToMinutes(parsed.value);
        }
    }
    return map;
}

// Return the UTC offset in minutes for iana timezone at a given UTC date.
// Positive = east of UTC (e.g. Europe/Warsaw in summer → +120).
function _getTimezoneOffsetMin(iana, utcDate) {
    try {
        const p = getTimeZoneParts(utcDate, iana);
        const localMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
        return Math.round((localMs - utcDate.getTime()) / 60000);
    } catch {
        return null;
    }
}


function normalizeIanaTimeZone(rawTz, vtimezoneMap = {}, defaultTimeZone = '') {
    const value = String(rawTz || '').trim().replace(/^"|"$/g, '');
    if (!value) return '';

    // 1. Direct IANA name check
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
        return value;
    } catch { /* not a valid IANA name */ }

    // 2. Windows key name via windows-iana package (covers all ~130 Windows zones)
    const winIana = _winKeyToIana(value);
    if (winIana) return winIana;

    // 3. VTIMEZONE map built from the ICS file itself
    if (vtimezoneMap[value]?.iana) return vtimezoneMap[value].iana;

    // 4. For Outlook display-name TZIDs like "(UTC+01:00) Sarajevo, Skopje, Warsaw, Zagreb":
    //    Extract the standard UTC offset, then find a VTIMEZONE entry with the same
    //    standard offset and reuse its DST-aware IANA name.
    //    This avoids fixed Etc/GMT zones which break during DST transitions.
    const offsetMatch = value.match(/^\(UTC([+-])(\d{2}):(\d{2})\)/);
    if (offsetMatch) {
        const sign = offsetMatch[1] === '+' ? 1 : -1;
        const baseMin = sign * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]));
        // Match to a known VTIMEZONE entry with the same standard offset
        for (const entry of Object.values(vtimezoneMap)) {
            if (entry.iana && entry.stdOffsetMin === baseMin) return entry.iana;
        }
        // Try the user-configured defaultTimeZone when the VTIMEZONE entry for this display name
        // exists but has no resolvable IANA name (common for Outlook Windows display-name TZIDs).
        // Validate by comparing both standard and DST UTC offsets.
        if (defaultTimeZone) {
            const thisEntry = vtimezoneMap[value];
            if (thisEntry && thisEntry.stdOffsetMin === baseMin) {
                // Reference dates: mid-January (standard time) and mid-July (DST)
                const winterRef = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
                const summerRef = new Date(Date.UTC(2026, 6, 15, 12, 0, 0));
                const dtStdOffset = _getTimezoneOffsetMin(defaultTimeZone, winterRef);
                if (dtStdOffset === baseMin) {
                    // DST check: skip if no DAYLIGHT block captured, otherwise verify
                    if (thisEntry.dstOffsetMin === null) return defaultTimeZone;
                    const dtDstOffset = _getTimezoneOffsetMin(defaultTimeZone, summerRef);
                    if (dtDstOffset === thisEntry.dstOffsetMin) return defaultTimeZone;
                }
            }
        }
        // Last resort: fixed Etc/GMT (no DST — 1h off in summer, but no data loss)
        const etcGmt = _offsetMinutesToEtcGmt(baseMin);
        if (etcGmt) return etcGmt;
    }

    return '';
}

function getTimeZoneParts(date, timezone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);

    const out = {};
    for (const part of parts) {
        if (part.type === 'year') out.year = Number(part.value);
        if (part.type === 'month') out.month = Number(part.value);
        if (part.type === 'day') out.day = Number(part.value);
        if (part.type === 'hour') out.hour = Number(part.value);
        if (part.type === 'minute') out.minute = Number(part.value);
        if (part.type === 'second') out.second = Number(part.value);
    }
    return out;
}

function parseZonedDateTime(year, month, day, hour, minute, second, timezone) {
    const targetUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    let guessUtc = targetUtc;

    // Iteracyjnie dopasowujemy offset strefy (w tym DST) do zadanych komponentów.
    for (let i = 0; i < 4; i += 1) {
        const got = getTimeZoneParts(new Date(guessUtc), timezone);
        const gotUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second);
        const delta = targetUtc - gotUtc;
        if (delta === 0) break;
        guessUtc += delta;
    }

    return new Date(guessUtc);
}

function parseIcsDate(raw, params = {}, options = {}) {
    if (!raw) return null;
    if (params.VALUE === 'DATE' || /^\d{8}$/.test(raw)) {
        const y = Number(raw.slice(0, 4));
        const m = Number(raw.slice(4, 6));
        const d = Number(raw.slice(6, 8));
        return new Date(Date.UTC(y, m - 1, d));
    }

    const match = String(raw).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/);
    if (!match) return null;
    const [, y, mo, d, h, mi, s = '00', z] = match;
    if (z === 'Z') return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));

    const tzid = normalizeIanaTimeZone(params.TZID, options.vtimezoneMap, options.defaultTimeZone) || normalizeIanaTimeZone(options.defaultTimeZone, {});
    if (tzid) {
        return parseZonedDateTime(Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(s), tzid);
    }

    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

function parseRRule(raw = '') {
    const out = {};
    for (const part of raw.split(';')) {
        const idx = part.indexOf('=');
        if (idx > 0) out[part.slice(0, idx).toUpperCase()] = part.slice(idx + 1);
    }
    return Object.keys(out).length ? out : null;
}

function parseExDates(raw = '', params = {}, options = {}) {
    if (!raw) return [];
    return raw.split(',').map((v) => parseIcsDate(v.trim(), params, options)).filter(Boolean);
}

function unescapeIcsText(v = '') {
    return String(v)
        .replace(/\\n/gi, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');
}

function stripUrlNoise(raw = '') {
    return String(raw).trim().replace(/^<+/, '').replace(/>+$/, '').replace(/[),.;]+$/, '');
}

function decodeSafeLink(rawUrl = '') {
    const cleaned = stripUrlNoise(rawUrl);
    if (!cleaned) return '';
    try {
        const url = new URL(cleaned);
        if (!url.hostname.includes('safelinks.protection.outlook.com')) return cleaned;
        const target = url.searchParams.get('url');
        return target ? stripUrlNoise(target) : cleaned;
    } catch {
        return cleaned;
    }
}

function extractJoinUrl(description = '', urlProp = '') {
    const links = description.match(/https?:\/\/[^\s<>")]+/gi) || [];
    const decodedLinks = links.map(decodeSafeLink);
    const teams = decodedLinks.find((l) => /^https:\/\/teams\.microsoft\.com\//i.test(l));
    if (teams) return teams;

    const decodedUrlProp = decodeSafeLink(urlProp);
    if (/^https:\/\/teams\.microsoft\.com\//i.test(decodedUrlProp)) return decodedUrlProp;

    return decodedUrlProp || decodedLinks[0] || '';
}

function parseIcsEvents(rawIcs, options = {}) {
    const lines = unfoldIcs(rawIcs).split(/\r?\n/);
    // Parse VTIMEZONE blocks first — builds a tzid→IANA map from definitions
    // embedded in the ICS itself, so external timezone dictionaries are not needed.
    const vtimezoneMap = parseVTimezones(lines);
    const events = [];
    let current = null;

    for (const line of lines) {
        if (line === 'BEGIN:VEVENT') {
            current = { raw: {} };
            continue;
        }
        if (line === 'END:VEVENT') {
            if (current) events.push(current);
            current = null;
            continue;
        }
        if (!current) continue;

        const parsed = parseLine(line);
        if (!parsed) continue;
        current.raw[parsed.name] = { value: parsed.value, params: parsed.params };
    }

    return events
        .map((event) => {
            const parseOpts = { defaultTimeZone: options.defaultTimeZone || '', vtimezoneMap };
            const start = parseIcsDate(event.raw.DTSTART?.value, event.raw.DTSTART?.params, parseOpts);
            const end = parseIcsDate(event.raw.DTEND?.value, event.raw.DTEND?.params, parseOpts) || start;
            if (!start || !end) return null;

            const isAllDay = event.raw.DTSTART?.params?.VALUE === 'DATE' || /^\d{8}$/.test(event.raw.DTSTART?.value || '');
            const description = unescapeIcsText(event.raw.DESCRIPTION?.value || '');
            const webLink = unescapeIcsText(event.raw.URL?.value || '');

            return {
                id: unescapeIcsText(event.raw.UID?.value || ''),
                subject: unescapeIcsText(event.raw.SUMMARY?.value || '(no subject)'),
                start,
                end,
                isAllDay,
                timezone: normalizeIanaTimeZone(event.raw.DTSTART?.params?.TZID, vtimezoneMap, parseOpts.defaultTimeZone) || parseOpts.defaultTimeZone,
                recurrenceId: parseIcsDate(event.raw['RECURRENCE-ID']?.value, event.raw['RECURRENCE-ID']?.params, parseOpts),
                rrule: parseRRule(event.raw.RRULE?.value || ''),
                exdates: parseExDates(event.raw.EXDATE?.value || '', event.raw.EXDATE?.params || {}, parseOpts),
                isCancelled: (event.raw.STATUS?.value || '').toUpperCase() === 'CANCELLED',
                organizer: unescapeIcsText(event.raw.ORGANIZER?.value || ''),
                location: unescapeIcsText(event.raw.LOCATION?.value || ''),
                webLink,
                joinUrl: extractJoinUrl(description, webLink),
                bodyPreview: description.slice(0, 280),
                source: 'ics',
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.start - b.start);
}

function addDays(date, amount) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + amount);
    return copy;
}

function toDateOnlyLocal(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function toOccurrenceKey(uid, date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${uid}|${y}-${m}-${d}T${hh}:${mm}`;
}

function getDayDifferenceUTC(date1, date2) {
    const utc1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const utc2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.floor((utc2 - utc1) / 86400000);
}

function expandRecurringEvents(events, fromDate, horizonDays = 60) {
    const windowStart = new Date(fromDate);
    const windowEnd = addDays(windowStart, horizonDays);
    const explicit = events.filter((event) => !!event.recurrenceId);
    const explicitKeys = new Set(explicit.map((event) => toOccurrenceKey(event.id, event.start)));
    const out = events.filter((event) => (!event.rrule || event.recurrenceId) && event.end >= windowStart);

    for (const master of events) {
        if (!master.rrule || master.recurrenceId) continue;
        const freq = String(master.rrule.FREQ || '').toUpperCase();
        if (freq !== 'DAILY' && freq !== 'WEEKLY') continue;

        const interval = Math.max(1, Number(master.rrule.INTERVAL || 1));
        const byDay = String(master.rrule.BYDAY || '')
            .split(',')
            .map((x) => x.trim().toUpperCase())
            .filter(Boolean);

        const until = parseIcsDate(master.rrule.UNTIL || '', {}, { defaultTimeZone: master.timezone || '' });
        const rangeEnd = until && until < windowEnd ? until : windowEnd;
        const startDay = toDateOnlyLocal(master.start);
        const iterStart = toDateOnlyLocal(master.start > windowStart ? master.start : windowStart);

        for (let day = new Date(iterStart); day <= rangeEnd; day = addDays(day, 1)) {
            const diffDays = getDayDifferenceUTC(startDay, day);
            if (diffDays < 0) continue;

            let matches = false;
            if (freq === 'DAILY') {
                matches = diffDays % interval === 0;
            } else {
                const iCalDay = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][day.getDay()];
                const defaultDay = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][master.start.getDay()];
                const wantedDays = byDay.length ? byDay : [defaultDay];
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
            if (master.exdates.some((x) => x.getTime() === occStart.getTime())) continue;

            const key = toOccurrenceKey(master.id, occStart);
            if (explicitKeys.has(key)) continue;

            out.push({
                ...master,
                start: occStart,
                end: occEnd,
                recurrenceId: occStart,
                rrule: null,
            });
        }
    }

    return out.sort((a, b) => a.start - b.start);
}

async function fetchIcsCalendarWindow(icsUrl, options = {}) {
    if (!icsUrl) throw new Error('ICS URL missing');
    const response = await fetch(icsUrl);
    if (!response.ok) throw new Error(`ICS request failed: HTTP ${response.status}`);
    const raw = await response.text();
    const parsed = parseIcsEvents(raw, { defaultTimeZone: options.timezone || '' });
    return expandRecurringEvents(parsed, options.fromDate || new Date(), options.horizonDays || 90);
}

function pickNextNotCanceled(events, nowMs = Date.now()) {
    // All-day events are never picked as "next" — they span the whole day and
    // would otherwise match "in progress" forever, hiding every real meeting
    // scheduled underneath them. All-day events are shown in the agenda only.
    const timed = events.filter((event) => !event.isCancelled && !event.isAllDay);
    return timed.find((event) => event.start.getTime() <= nowMs && event.end.getTime() >= nowMs) ||
           timed.find((event) => event.start.getTime() >= nowMs) ||
           null;
}

function pickActiveAllDay(events, nowMs = Date.now()) {
    return events.find((event) => !event.isCancelled && event.isAllDay && event.start.getTime() <= nowMs && event.end.getTime() > nowMs) || null;
}

function getWorkingDayKey(date, timezone) {
    return new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: timezone,
    }).format(date);
}

function isWorkingDay(date, timezone) {
    const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone }).format(date);
    return dayName !== 'Sat' && dayName !== 'Sun';
}

function formatAgendaDayLabel(date, timezone) {
    return new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: timezone,
    }).format(date);
}

function buildWorkingDaysAgenda(events, options = {}) {
    const timezone = options.timezone || 'Europe/Warsaw';
    const now = options.now || new Date();
    const daysCount = Math.max(1, Number(options.daysCount || 5));
    const grouped = new Map();

    for (const event of events) {
        if (event.isCancelled || event.end < now || !isWorkingDay(event.start, timezone)) continue;
        const key = getWorkingDayKey(event.start, timezone);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(event);
    }

    return [...grouped.entries()]
        .slice(0, daysCount)
        .map(([dayKey, items]) => ({
            dayKey,
            dayLabel: formatAgendaDayLabel(items[0].start, timezone),
            items: items.sort((a, b) => a.start - b.start),
        }));
}

function serializeEvent(event) {
    if (!event) return null;
    return {
        id: event.id,
        subject: event.subject,
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        isCancelled: !!event.isCancelled,
        isAllDay: !!event.isAllDay,
        organizer: event.organizer || '',
        location: event.location || '',
        joinUrl: event.joinUrl || '',
        webLink: event.webLink || '',
        bodyPreview: event.bodyPreview || '',
        source: event.source || '',
    };
}

module.exports = {
    fetchIcsCalendarWindow,
    pickNextNotCanceled,
    pickActiveAllDay,
    buildWorkingDaysAgenda,
    serializeEvent,
    __test__: {
        parseIcsEvents,
        expandRecurringEvents,
        decodeSafeLink,
        extractJoinUrl,
    },
};

