const test = require('node:test');
const assert = require('assert');

const { createServer } = require('../../../uploader/server');

async function withServer(deps, run) {
    const server = createServer(deps);
    await new Promise((resolve) => server.listen(0, resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
        await run(baseUrl);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

async function getJson(url) {
    const response = await fetch(url);
    const payload = await response.json();
    return { status: response.status, payload };
}

async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const payload = await response.json();
    return { status: response.status, payload };
}

test('m365 calendar server endpoints', async (t) => {
    const nowMs = Date.parse('2026-04-13T10:00:00.000Z');
    const fallbackEvents = [
        {
            id: 'i-1',
            subject: 'Fallback Meeting',
            isCancelled: false,
            start: new Date('2026-04-14T11:00:00.000Z'),
            end: new Date('2026-04-14T12:00:00.000Z'),
            organizer: 'Ics User',
            location: 'Remote',
            joinUrl: 'https://teams.microsoft.com/ics',
            webLink: '',
            bodyPreview: 'Fallback from ICS',
            source: 'ics',
        },
    ];

    await t.test('GET /api/m365/calendar/next returns ICS event', async () => {
        await withServer({
            now: () => nowMs,
            fetchIcsCalendarWindow: async () => fallbackEvents,
            config: { timezone: 'UTC', workDays: 5, icsUrl: 'https://example.test/calendar.ics' },
        }, async (baseUrl) => {
            const { status, payload } = await getJson(`${baseUrl}/api/m365/calendar/next`);
            assert.strictEqual(status, 200);
            assert.strictEqual(payload.source, 'ics');
            assert.strictEqual(payload.next.id, 'i-1');
            assert.strictEqual(payload.next.subject, 'Fallback Meeting');
        });
    });

    await t.test('GET /api/m365/calendar/agenda returns ICS agenda', async () => {
        await withServer({
            now: () => nowMs,
            fetchIcsCalendarWindow: async () => fallbackEvents,
            config: { timezone: 'UTC', workDays: 5, icsUrl: 'https://example.test/calendar.ics' },
        }, async (baseUrl) => {
            const { status, payload } = await getJson(`${baseUrl}/api/m365/calendar/agenda?days=5&workingDays=true`);
            assert.strictEqual(status, 200);
            assert.strictEqual(payload.source, 'ics');
            assert.strictEqual(payload.days.length, 1);
            assert.strictEqual(payload.days[0].items[0].id, 'i-1');
        });
    });

    await t.test('POST /api/m365/calendar/agenda uses ICS URL from request payload (UI config)', async () => {
        let capturedIcsUrl = '';
        await withServer({
            now: () => nowMs,
            fetchIcsCalendarWindow: async (icsUrl) => {
                capturedIcsUrl = icsUrl;
                return fallbackEvents;
            },
            config: { timezone: 'UTC', workDays: 5, icsUrl: '' },
        }, async (baseUrl) => {
            const { status, payload } = await postJson(`${baseUrl}/api/m365/calendar/agenda`, {
                icsUrl: 'https://tenant.example/calendar.ics',
            });
            assert.strictEqual(status, 200);
            assert.strictEqual(payload.source, 'ics');
            assert.strictEqual(capturedIcsUrl, 'https://tenant.example/calendar.ics');
        });
    });

    await t.test('GET /api/m365/calendar/next returns 500 without configured ICS URL', async () => {
        await withServer({
            now: () => nowMs,
            fetchIcsCalendarWindow: async () => fallbackEvents,
            config: { timezone: 'UTC', workDays: 5, icsUrl: '' },
        }, async (baseUrl) => {
            const { status, payload } = await getJson(`${baseUrl}/api/m365/calendar/next`);
            assert.strictEqual(status, 500);
            assert.match(payload.error, /ICS URL is not configured/i);
        });
    });

    await t.test('GET /api/m365/calendar/event validates eventId', async () => {
        await withServer({
            now: () => nowMs,
            fetchIcsCalendarWindow: async () => fallbackEvents,
            config: { timezone: 'UTC', workDays: 5, icsUrl: 'https://example.test/calendar.ics' },
        }, async (baseUrl) => {
            const missing = await getJson(`${baseUrl}/api/m365/calendar/event`);
            assert.strictEqual(missing.status, 400);
            assert.strictEqual(missing.payload.error, 'eventId is required');

            const ok = await getJson(`${baseUrl}/api/m365/calendar/event?eventId=i-1`);
            assert.strictEqual(ok.status, 200);
            assert.strictEqual(ok.payload.event.id, 'i-1');
        });
    });

    await t.test('POST /api/m365/calendar/next works with ICS payload (UI path)', async () => {
        await withServer({
            now: () => nowMs,
            fetchIcsCalendarWindow: async () => fallbackEvents,
            config: { timezone: 'UTC', workDays: 5, icsUrl: '' },
        }, async (baseUrl) => {
            const { status, payload } = await postJson(`${baseUrl}/api/m365/calendar/next`, {
                icsUrl: 'https://tenant.example/calendar.ics',
                timezone: 'Europe/Warsaw',
            });

            assert.strictEqual(status, 200);
            assert.strictEqual(payload.source, 'ics');
            assert.strictEqual(payload.next.id, 'i-1');
        });
    });

    await t.test('POST /api/m365/calendar/next forwards timezone to ICS loader options', async () => {
        let capturedOptions = null;
        await withServer({
            now: () => nowMs,
            fetchIcsCalendarWindow: async (_icsUrl, options) => {
                capturedOptions = options;
                return fallbackEvents;
            },
            config: { timezone: 'UTC', workDays: 5, icsUrl: '' },
        }, async (baseUrl) => {
            const { status } = await postJson(`${baseUrl}/api/m365/calendar/next`, {
                icsUrl: 'https://tenant.example/calendar.ics',
                timezone: 'Europe/Warsaw',
            });

            assert.strictEqual(status, 200);
            assert.ok(capturedOptions);
            assert.strictEqual(capturedOptions.timezone, 'Europe/Warsaw');
        });
    });
});

