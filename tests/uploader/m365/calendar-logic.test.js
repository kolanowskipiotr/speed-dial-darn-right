const test = require('node:test');
const assert = require('assert');

const {
    pickNextNotCanceled,
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

    await t.test('SafeLinks are decoded to Teams URL', () => {
        const safeLink = 'https://nam01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fteams.microsoft.com%2Fl%2Fmeetup-join%2Fabc';
        const decoded = decodeSafeLink(safeLink);
        assert.strictEqual(decoded, 'https://teams.microsoft.com/l/meetup-join/abc');

        const picked = extractJoinUrl(`Join here ${safeLink}`, '');
        assert.strictEqual(picked, 'https://teams.microsoft.com/l/meetup-join/abc');
    });
});

