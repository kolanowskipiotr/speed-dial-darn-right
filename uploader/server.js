const http = require('http');
const fs   = require('fs');
const path = require('path');
const { performSync, listGDriveFolders, listGDriveBackups, fetchGDriveFile, createGDriveFolder } = require('./sync');
const { exchangeCode, getFreshToken } = require('./auth');
const {
    fetchIcsCalendarWindow,
    pickNextNotCanceled,
    buildWorkingDaysAgenda,
    serializeEvent,
} = require('./m365-calendar');

let UPLOADS_DIR = process.env.UPLOADS_DIR || '/uploads';
const PORT = 3001;

// Ensure uploads dir exists
if (!fs.existsSync(UPLOADS_DIR)) {
    try {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    } catch (error) {
        const localFallback = path.resolve(process.cwd(), 'uploads');
        fs.mkdirSync(localFallback, { recursive: true });
        UPLOADS_DIR = localFallback;
    }
}

function json(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
}

function getM365Config(overrides = {}) {
    return {
        timezone: process.env.M365_TIMEZONE || 'Europe/Warsaw',
        workDays: Math.max(1, Number(process.env.M365_WORK_DAYS || 5)),
        icsUrl: process.env.M365_ICS_URL || '',
        horizonDays: Math.max(30, Number(process.env.M365_ICS_HORIZON_DAYS || 90)),
        ...overrides,
    };
}

function getM365RequestConfig(req, baseConfig, requestUrl, requestData = {}) {
    let icsUrl = requestData.icsUrl || requestUrl.searchParams.get('icsUrl') || req.headers['x-m365-ics-url'] || baseConfig.icsUrl;
    const encodedIcs = req.headers['x-m365-ics-url-enc'];
    if (encodedIcs) {
        try {
            icsUrl = decodeURIComponent(String(encodedIcs));
        } catch {
            icsUrl = '';
        }
    }
    return {
        ...baseConfig,
        timezone: requestData.timezone || requestUrl.searchParams.get('timezone') || req.headers['x-m365-timezone'] || baseConfig.timezone,
        icsUrl,
    };
}

function createServer(deps = {}) {
    const _exchangeCode = deps.exchangeCode || exchangeCode;
    const _getFreshToken = deps.getFreshToken || getFreshToken;
    const _fetchIcsCalendarWindow = deps.fetchIcsCalendarWindow || fetchIcsCalendarWindow;
    const _now = deps.now || (() => Date.now());
    const m365Config = getM365Config(deps.config || {});
    const icsCache = new Map();
    const ICS_CACHE_TTL_MS = 60 * 1000;

    function getIcsCacheKey(requestConfig) {
        return JSON.stringify({
            icsUrl: requestConfig.icsUrl || '',
            timezone: requestConfig.timezone || '',
            horizonDays: requestConfig.horizonDays,
        });
    }

    async function loadCalendarEvents(requestConfig) {
        const startDate = new Date(_now());
        if (!requestConfig.icsUrl) throw new Error('ICS URL is not configured');

        const cacheKey = getIcsCacheKey(requestConfig);
        const cached = icsCache.get(cacheKey);
        const nowMs = _now();
        if (cached && nowMs - cached.cachedAt < ICS_CACHE_TTL_MS) {
            return {
                ...cached.payload,
                cache: {
                    hit: true,
                    ageMs: nowMs - cached.cachedAt,
                    ttlMs: ICS_CACHE_TTL_MS,
                },
            };
        }

        const events = await _fetchIcsCalendarWindow(requestConfig.icsUrl, {
            fromDate: startDate,
            horizonDays: requestConfig.horizonDays,
            timezone: requestConfig.timezone,
        });
        const payload = { source: 'ics', events };
        icsCache.set(cacheKey, { cachedAt: nowMs, payload });
        return {
            ...payload,
            cache: {
                hit: false,
                ageMs: 0,
                ttlMs: ICS_CACHE_TTL_MS,
            },
        };
    }

    return http.createServer(async (req, res) => {
    // --- Auth: exchange code for tokens (no Authorization header needed) ---
    if (req.url === '/api/sync/auth' && req.method === 'POST') {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', async () => {
            try {
                const { code } = JSON.parse(Buffer.concat(chunks).toString());
                const result = await _exchangeCode(code);
                json(res, 200, result);
            } catch (e) {
                console.error('[auth] Code exchange failed:', e.message);
                json(res, 500, { error: e.message });
            }
        });
        return;
    }

    // --- Auth: silent token refresh using stored refresh token ---
    if (req.url === '/api/sync/auth/token' && req.method === 'GET') {
        try {
            const tokens = await _getFreshToken();
            if (!tokens) {
                json(res, 404, { error: 'no_session' });
                return;
            }
            json(res, 200, tokens);
        } catch (e) {
            console.error('[auth] Token refresh failed:', e.message);
            json(res, 401, { error: 'refresh_failed' });
        }
        return;
    }

    // --- M365 Calendar API ---
    if (req.url.startsWith('/api/m365/calendar') && (req.method === 'GET' || req.method === 'POST')) {
        const requestUrl = new URL(req.url, `http://${req.headers.host}`);
        let requestData = {};
        if (req.method === 'POST') {
            try {
                const chunks = [];
                for await (const chunk of req) chunks.push(chunk);
                const rawBody = Buffer.concat(chunks).toString();
                requestData = rawBody ? JSON.parse(rawBody) : {};
            } catch {
                json(res, 400, { error: 'invalid_json' });
                return;
            }
        }

        const requestConfig = getM365RequestConfig(req, m365Config, requestUrl, requestData);
        const daysParam = Number(requestData.days || requestUrl.searchParams.get('days') || m365Config.workDays);
        const days = Math.max(1, daysParam);

        try {
            const calendarData = await loadCalendarEvents(requestConfig);

            if (requestUrl.pathname === '/api/m365/calendar/next') {
                const next = pickNextNotCanceled(calendarData.events, _now());
                json(res, 200, {
                    source: calendarData.source,
                    next: serializeEvent(next),
                    cache: calendarData.cache,
                    fetchedAt: new Date(_now()).toISOString(),
                });
                return;
            }

            if (requestUrl.pathname === '/api/m365/calendar/agenda') {
                const agenda = buildWorkingDaysAgenda(calendarData.events, {
                    timezone: requestConfig.timezone,
                    daysCount: days,
                    now: new Date(_now()),
                });
                json(res, 200, {
                    source: calendarData.source,
                    cache: calendarData.cache,
                    days: agenda.map((day) => ({
                        dayKey: day.dayKey,
                        dayLabel: day.dayLabel,
                        items: day.items.map(serializeEvent),
                    })),
                    fetchedAt: new Date(_now()).toISOString(),
                });
                return;
            }

            if (requestUrl.pathname === '/api/m365/calendar/event') {
                const eventId = requestData.eventId || requestUrl.searchParams.get('eventId') || '';
                if (!eventId) {
                    json(res, 400, { error: 'eventId is required' });
                    return;
                }
                const event = calendarData.events.find((item) => item.id === eventId) || null;
                json(res, 200, {
                    source: calendarData.source,
                    cache: calendarData.cache,
                    event: serializeEvent(event),
                });
                return;
            }
        } catch (error) {
            console.error('[m365] Calendar endpoint failed:', error.message);
            json(res, 500, { error: error.message });
            return;
        }

        res.writeHead(404);
        res.end('not found');
        return;
    }

    // API: SYNC OPERATIONS (POST, GET)
    if (req.url.startsWith('/api/sync')) {
        const folderId = req.headers['x-gdrive-folder-id'];
        const token = req.headers['authorization']?.split(' ')[1] || req.headers['x-access-token'];

        if (!token) {
            res.writeHead(401);
            res.end('Unauthorized: No token provided');
            return;
        }

        // --- Folders API ---
        if (req.url === '/api/sync/folders' && req.method === 'GET') {
            try {
                const folders = await listGDriveFolders(token);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(folders));
            } catch (e) {
                const status = e.status || e.code;
                if (status === 401) { res.writeHead(401); res.end('Unauthorized'); return; }
                console.error('[sync] GET /api/sync/folders failed:', e.message);
                res.writeHead(500);
                res.end('error');
            }
            return;
        }

        // --- Create Folder API ---
        if (req.url === '/api/sync/create-folder' && req.method === 'POST') {
            const chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', async () => {
                try {
                    const { name } = JSON.parse(Buffer.concat(chunks).toString());
                    const folder = await createGDriveFolder(token, name);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(folder));
                } catch (e) {
                    console.error('[sync] POST /api/sync/create-folder failed:', e.message);
                    res.writeHead(500);
                    res.end('error');
                }
            });
            return;
        }

        if (req.url === '/api/sync' && req.method === 'POST') { // Backup
            const chunks = [];
            const forceFull = req.headers['x-backup-full'] === 'true';
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', async () => {
                try {
                    const data = JSON.parse(Buffer.concat(chunks).toString());
                    await performSync(data, token, folderId, { forceFull });
                    res.writeHead(200);
                    res.end('ok');
                } catch (e) {
                    console.error('[sync] POST /api/sync failed:', e);
                    res.writeHead(500);
                    res.end('error');
                }
            });
            return;
        } else if (req.url.startsWith('/api/sync/list') && req.method === 'GET') { // List backups
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const targetFolderId = urlObj.searchParams.get('folderId') || folderId;
            if (!targetFolderId) {
                res.writeHead(400);
                res.end('Bad Request: Folder ID missing');
                return;
            }
            try {
                const backups = await listGDriveBackups(token, targetFolderId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(backups));
            } catch (e) {
                const status = e.status || e.code;
                if (status === 401) { res.writeHead(401); res.end('Unauthorized'); return; }
                console.error(`[sync] GET /api/sync/list failed for folder ${targetFolderId}:`, e);
                res.writeHead(500);
                res.end('error');
            }
            return;
        } else if (req.url.startsWith('/api/sync/fetch') && req.method === 'GET') { // Fetch backup
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const fileId = urlObj.searchParams.get('fileId');
            if (!fileId) {
                res.writeHead(400);
                res.end('Bad Request: File ID missing');
                return;
            }
            try {
                const content = await fetchGDriveFile(token, fileId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(content));
            } catch (e) {
                console.error(`[sync] GET /api/sync/fetch failed for file ${fileId}:`, e);
                res.writeHead(500);
                res.end('error');
            }
            return;
        }
        return;
    }

    // --- File Uploads ---
    const match = req.url.match(/^\/upload\/([a-z0-9]+(?:\.[a-z0-9]{2,5})?)$/);
    if (!match) { res.writeHead(404); res.end('not found'); return; }

    const id       = match[1];
    const filename = id.includes('.') ? id : id + '.jpg';
    const filepath = path.join(UPLOADS_DIR, filename);

    if (req.method === 'POST') {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            fs.writeFile(filepath, Buffer.concat(chunks), err => {
                if (err) { console.error('write error', err); res.writeHead(500); res.end('error'); return; }
                res.writeHead(200);
                res.end('ok');
            });
        });

    } else if (req.method === 'DELETE') {
        fs.unlink(filepath, err => {
            if (err && err.code !== 'ENOENT') {
                console.error('unlink error', err);
                res.writeHead(500); res.end('error'); return;
            }
            res.writeHead(200);
            res.end('ok');
        });

    } else {
        res.writeHead(405);
        res.end('method not allowed');
    }

    });
}

if (require.main === module) {
    createServer().listen(PORT, () => console.log(`uploader listening on ${PORT}`));
}

module.exports = { createServer, getM365Config };
