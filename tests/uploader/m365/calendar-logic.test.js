const test = require('node:test');
const assert = require('assert');

const {
    pickNextNotCanceled,
    countOverlapping,
    pickActiveAllDay,
    buildWorkingDaysAgenda,
    __test__: {
        parseIcsEvents,
        expandRecurringEvents,
        decodeSafeLink,
        extractJoinUrl,
    },
} = require('../../../uploader/m365-calendar');

test('m365 calendar logic', async (t) => {
    await t.test('pickNextNotCanceled keeps in-progress meeting', () => {
        const now = Date.parse('2026-04-13T10:00:00.000Z');
        const events = [
            { id: 'past', isCancelled: false, start: new Date('2026-04-13T07:00:00.000Z'), end: new Date('2026-04-13T08:00:00.000Z') },
            { id: 'in-progress', isCancelled: false, start: new Date('2026-04-13T09:50:00.000Z'), end: new Date('2026-04-13T10:20:00.000Z') },
            { id: 'cancelled', isCancelled: true, start: new Date('2026-04-13T10:10:00.000Z'), end: new Date('2026-04-13T10:50:00.000Z') },
        ];

        const next = pickNextNotCanceled(events, now);
        assert(next);
        assert.strictEqual(next.id, 'in-progress');
    });

    await t.test('pickNextNotCanceled never picks an all-day event (regression: all-day event blocked every timed meeting)', () => {
        // An all-day event spans midnight-to-midnight, so it always satisfies
        // "start <= now <= end" — it must never be treated as "next" at all.
        // Full-day events are surfaced separately via pickActiveAllDay/the agenda.
        const allDay = { id: 'allday', isCancelled: false, isAllDay: true, start: new Date('2026-07-03T00:00:00.000Z'), end: new Date('2026-07-04T00:00:00.000Z') };

        // Before the day's first meeting starts: the upcoming timed meeting wins, not the all-day event.
        const upcoming = { id: 'upcoming', isCancelled: false, start: new Date('2026-07-03T10:30:00.000Z'), end: new Date('2026-07-03T11:00:00.000Z') };
        let next = pickNextNotCanceled([allDay, upcoming], Date.parse('2026-07-03T08:00:00.000Z'));
        assert.strictEqual(next.id, 'upcoming');

        // Once that meeting is in progress, it still wins over the all-day event.
        next = pickNextNotCanceled([allDay, upcoming], Date.parse('2026-07-03T10:45:00.000Z'));
        assert.strictEqual(next.id, 'upcoming');

        // With only the all-day event present, "next" is null — never the all-day event.
        next = pickNextNotCanceled([allDay], Date.parse('2026-07-03T08:00:00.000Z'));
        assert.strictEqual(next, null);
    });

    await t.test('pickNextNotCanceled shows the overlapping meeting whose start is closest to now', () => {
        const at = (hhmm) => Date.parse(`2026-07-03T${hhmm}:00.000Z`);
        const ev = (id, from, to) => ({ id, isCancelled: false, start: new Date(at(from)), end: new Date(at(to)) });
        const events = [ev('s1', '10:00', '15:00'), ev('s2', '11:00', '16:00'), ev('s3', '12:00', '14:00')];
        const pick = (hhmm) => pickNextNotCanceled(events, at(hhmm)).id;

        assert.strictEqual(pick('10:30'), 's1');
        assert.strictEqual(pick('10:56'), 's2'); // s2 starts within the 5-minute margin
        assert.strictEqual(pick('11:30'), 's2');
        assert.strictEqual(pick('12:00'), 's3');
        assert.strictEqual(pick('13:30'), 's3');
        assert.strictEqual(pick('14:30'), 's2'); // s3 ended, s2 started later than s1
        assert.strictEqual(pick('15:30'), 's2');

        assert.strictEqual(countOverlapping(events, at('10:30')), 1);
        assert.strictEqual(countOverlapping(events, at('11:30')), 2);
        assert.strictEqual(countOverlapping(events, at('12:00')), 3);
        assert.strictEqual(countOverlapping(events, at('14:30')), 2);
    });

    await t.test('pickNextNotCanceled prefers the earlier meeting when starts fall within the margin', () => {
        const at = (hhmm) => Date.parse(`2026-07-03T${hhmm}:00.000Z`);
        const ev = (id, from, to) => ({ id, isCancelled: false, start: new Date(at(from)), end: new Date(at(to)) });
        const events = [ev('late', '12:03', '13:00'), ev('early', '12:00', '12:30')];

        assert.strictEqual(pickNextNotCanceled(events, at('11:59')).id, 'early');
        assert.strictEqual(pickNextNotCanceled(events, at('12:10')).id, 'early');
        assert.strictEqual(pickNextNotCanceled(events, at('12:40')).id, 'late');
        assert.strictEqual(countOverlapping(events, at('12:10')), 2);
    });

    await t.test('pickActiveAllDay returns the all-day event covering now, and only that', () => {
        const allDay = { id: 'allday', isCancelled: false, isAllDay: true, start: new Date('2026-07-03T00:00:00.000Z'), end: new Date('2026-07-04T00:00:00.000Z') };
        const timed = { id: 'timed', isCancelled: false, isAllDay: false, start: new Date('2026-07-03T10:30:00.000Z'), end: new Date('2026-07-03T11:00:00.000Z') };

        assert.strictEqual(pickActiveAllDay([allDay, timed], Date.parse('2026-07-03T08:00:00.000Z')).id, 'allday');
        assert.strictEqual(pickActiveAllDay([allDay, timed], Date.parse('2026-07-04T08:00:00.000Z')), null);
        assert.strictEqual(pickActiveAllDay([timed], Date.parse('2026-07-03T08:00:00.000Z')), null);
    });

    await t.test('buildWorkingDaysAgenda excludes weekend and canceled meetings', () => {
        const now = new Date('2026-04-10T09:00:00.000Z'); // Friday
        const events = [
            { id: 'fri', isCancelled: false, start: new Date('2026-04-10T12:00:00.000Z'), end: new Date('2026-04-10T12:30:00.000Z') },
            { id: 'sat', isCancelled: false, start: new Date('2026-04-11T09:00:00.000Z'), end: new Date('2026-04-11T09:30:00.000Z') },
            { id: 'mon-cancel', isCancelled: true, start: new Date('2026-04-13T08:00:00.000Z'), end: new Date('2026-04-13T08:30:00.000Z') },
            { id: 'mon-ok', isCancelled: false, start: new Date('2026-04-13T10:00:00.000Z'), end: new Date('2026-04-13T10:30:00.000Z') },
        ];

        const days = buildWorkingDaysAgenda(events, { timezone: 'UTC', daysCount: 5, now });
        assert.strictEqual(days.length, 2);
        assert.deepStrictEqual(days.map((day) => day.items.map((item) => item.id)), [['fri'], ['mon-ok']]);
    });

    await t.test('ICS recurrence expands DAILY and respects EXDATE', () => {
        const rawIcs = [
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'UID:daily-1',
            'SUMMARY:Daily Standup',
            'DTSTART:20260413T090000Z',
            'DTEND:20260413T093000Z',
            'RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20260416T090000Z',
            'EXDATE:20260414T090000Z',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\n');

        const parsed = parseIcsEvents(rawIcs);
        const expanded = expandRecurringEvents(parsed, new Date('2026-04-13T00:00:00.000Z'), 7);
        assert.strictEqual(expanded.length, 3);
        const starts = expanded.map((item) => item.start.toISOString());
        assert.deepStrictEqual(starts, [
            '2026-04-13T09:00:00.000Z',
            '2026-04-15T09:00:00.000Z',
            '2026-04-16T09:00:00.000Z',
        ]);
    });

    await t.test('ICS TZID date-time is converted to correct UTC instant', () => {
        const rawIcs = [
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'UID:tzid-1',
            'SUMMARY:Local TZID meeting',
            'DTSTART;TZID=Europe/Warsaw:20260413T092000',
            'DTEND;TZID=Europe/Warsaw:20260413T095000',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\n');

        const parsed = parseIcsEvents(rawIcs);
        assert.strictEqual(parsed.length, 1);
        assert.strictEqual(parsed[0].start.toISOString(), '2026-04-13T07:20:00.000Z');
        assert.strictEqual(parsed[0].end.toISOString(), '2026-04-13T07:50:00.000Z');
    });

    await t.test('floating ICS date-time uses provided default timezone', () => {
        const rawIcs = [
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'UID:floating-1',
            'SUMMARY:Floating meeting',
            'DTSTART:20260413T092000',
            'DTEND:20260413T095000',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\n');

        const parsed = parseIcsEvents(rawIcs, { defaultTimeZone: 'Europe/Warsaw' });
        assert.strictEqual(parsed.length, 1);
        assert.strictEqual(parsed[0].start.toISOString(), '2026-04-13T07:20:00.000Z');
        assert.strictEqual(parsed[0].end.toISOString(), '2026-04-13T07:50:00.000Z');
    });

    await t.test('Outlook Windows display-name TZID with DST is parsed correctly (regression: 1h off in summer)', () => {
        // Reproduces the real Outlook ICS format:
        //   VTIMEZONE TZID uses escaped commas: "(UTC+01:00) Sarajevo\, Skopje\, Warsaw\, Zagreb"
        //   DTSTART TZID is quoted with real commas: TZID="(UTC+01:00) Sarajevo, Skopje, Warsaw, Zagreb"
        // Bug: parser fell back to Etc/GMT-1 (fixed UTC+1, no DST) instead of Europe/Warsaw (DST-aware UTC+2 in summer).
        // Result: 13:30 local was treated as 12:30 UTC → displayed as 14:30 Warsaw. Correct: 13:30 Warsaw = 11:30 UTC.
        const rawIcs = [
            'BEGIN:VCALENDAR',
            'BEGIN:VTIMEZONE',
            'TZID:(UTC+01:00) Sarajevo\\, Skopje\\, Warsaw\\, Zagreb',
            'BEGIN:STANDARD',
            'DTSTART:16010101T030000',
            'TZOFFSETFROM:+0200',
            'TZOFFSETTO:+0100',
            'RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10',
            'END:STANDARD',
            'BEGIN:DAYLIGHT',
            'DTSTART:16010101T020000',
            'TZOFFSETFROM:+0100',
            'TZOFFSETTO:+0200',
            'RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3',
            'END:DAYLIGHT',
            'END:VTIMEZONE',
            'BEGIN:VEVENT',
            'UID:dst-regression-1',
            'SUMMARY:Stability of Nexus PSC',
            'DTSTART;TZID="(UTC+01:00) Sarajevo, Skopje, Warsaw, Zagreb":20260518T133000',
            'DTEND;TZID="(UTC+01:00) Sarajevo, Skopje, Warsaw, Zagreb":20260518T143000',
            'STATUS:CONFIRMED',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n');

        const parsed = parseIcsEvents(rawIcs, { defaultTimeZone: 'Europe/Warsaw' });
        assert.strictEqual(parsed.length, 1);
        // 13:30 Warsaw CEST (UTC+2 in May) = 11:30 UTC — NOT 12:30 UTC (which Etc/GMT-1 would give)
        assert.strictEqual(parsed[0].start.toISOString(), '2026-05-18T11:30:00.000Z');
        assert.strictEqual(parsed[0].end.toISOString(), '2026-05-18T12:30:00.000Z');
    });

    await t.test('all-day (VALUE=DATE) event is flagged isAllDay', () => {
        // Regression: isAllDay was never computed, so a full-day Outlook event
        // (DTSTART/DTEND with VALUE=DATE, UTC-midnight instants) rendered as a
        // bogus "02:00-02:00" time range once converted to Europe/Warsaw (CEST).
        const rawIcs = [
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'UID:allday-1',
            'SUMMARY:Save the Date – TECH Growth Day Q2',
            'DTSTART;VALUE=DATE:20260703',
            'DTEND;VALUE=DATE:20260704',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\n');

        const parsed = parseIcsEvents(rawIcs, { defaultTimeZone: 'Europe/Warsaw' });
        assert.strictEqual(parsed.length, 1);
        assert.strictEqual(parsed[0].isAllDay, true);
        assert.strictEqual(parsed[0].start.toISOString(), '2026-07-03T00:00:00.000Z');
        assert.strictEqual(parsed[0].end.toISOString(), '2026-07-04T00:00:00.000Z');
    });

    await t.test('SafeLinks are decoded to Teams URL', () => {
        const safeLink = 'https://nam01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fteams.microsoft.com%2Fl%2Fmeetup-join%2Fabc';
        const decoded = decodeSafeLink(safeLink);
        assert.strictEqual(decoded, 'https://teams.microsoft.com/l/meetup-join/abc');

        const picked = extractJoinUrl(`Join here ${safeLink}`, '');
        assert.strictEqual(picked, 'https://teams.microsoft.com/l/meetup-join/abc');
    });
});

