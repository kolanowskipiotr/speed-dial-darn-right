let _m365State = {
    compact: null,
    agendaPopover: null,
    detailsPopover: null,
    agendaBody: null,
    detailsBody: null,
    detailsHeadActions: null,
    nextEvent: null,
    upcomingEvent: null,     // first not-yet-started meeting (favicon/title after current runs 15m)
    overlapCount: 0,
    allDayToday: null,
    agendaDays: [],
    detailsCache: {},
    hasNextCache: false,
    hasAgendaCache: false,
    compactRefreshing: false,
    compactRefreshInFlight: 0,
    compactTimer: null,
    agendaTimer: null,
    countdownTimer: null,
    // ICS indicator state
    icsFetchInFlight: 0,
    icsLastError: null,
    icsEverLoaded: false,
    // Alert / sound state
    alertWindowActive: false,
    alertEventId: null,      // event the active alert window belongs to
    alertAudioBlocked: false, // AudioContext still locked by autoplay policy
    alertMutedForId: null,
    alertSoundTimer: null,
    alertCheckTimer: null,
    alertNotificationSentForId: null,
};

// Shared AudioContext — created lazily on first play attempt
let _m365AudioCtx = null;

function _m365GetAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!_m365AudioCtx || _m365AudioCtx.state === 'closed') {
        try { _m365AudioCtx = new AudioCtx(); } catch (e) { return null; }
    }
    return _m365AudioCtx;
}

// Browsers keep an AudioContext suspended until a user gesture (autoplay policy).
// The bell fires from a timer, so unlock the context on any interaction beforehand.
function _m365UnlockAudio() {
    const ctx = _m365GetAudioContext();
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    _m365LoadBell(ctx).catch(() => {}); // preload so the first knock plays instantly
}
['pointerdown', 'keydown', 'touchstart'].forEach(type =>
    document.addEventListener(type, _m365UnlockAudio, { capture: true, passive: true })
);

const M365_BELL_URL = 'domain/calendar/bell.mp3';
const M365_BELL_KNOCKS = 2;          // knocks per burst
const M365_BELL_KNOCK_GAP_MS = 150;  // silence between knocks within a burst
const M365_ALERT_WINDOW_MS = 3 * 60 * 1000; // alert runs from start − 3 min to start + 3 min
// Silence after each burst, by time relative to meeting start. Faster repetition reads as
// more urgent, so it peaks just before start (time to join), then tapers fast so a forgotten
// alert doesn't nag the room. `until` is the phase end offset from start in ms.
const M365_BELL_PHASES = [
    { until: -90 * 1000, pauseMs: 30 * 1000 },
    { until: -30 * 1000, pauseMs: 15 * 1000 },
    { until:  15 * 1000, pauseMs:  5 * 1000 },
    { until:  60 * 1000, pauseMs: 15 * 1000 },
    { until: Infinity,   pauseMs: 60 * 1000 },
];
let _m365BellBuffer = null;
let _m365BellLoading = null;

// Decode once through the shared (gesture-unlocked) AudioContext — a plain
// <audio> element would be blocked by autoplay policy when fired from a timer.
function _m365LoadBell(ctx) {
    if (_m365BellBuffer) return Promise.resolve(_m365BellBuffer);
    if (!_m365BellLoading) {
        _m365BellLoading = fetch(M365_BELL_URL)
            .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
            .then(buf => ctx.decodeAudioData(buf))
            .then(decoded => (_m365BellBuffer = decoded))
            .catch(e => { _m365BellLoading = null; throw e; });
    }
    return _m365BellLoading;
}

const M365_AUDIO_RESUME_TIMEOUT_MS = 1000;
const M365_AUDIO_RETRY_MS = 2000;

function _m365SetAudioBlocked(blocked) {
    if (_m365State.alertAudioBlocked === blocked) return;
    _m365State.alertAudioBlocked = blocked;
    _m365RenderCompact();
}

// Plays one burst; resolves with its length in ms so the loop can schedule the next one,
// or -1 when autoplay policy still blocks audio (resume() stays pending until a gesture,
// so it is raced against a timeout instead of stalling the loop forever)
function _m365PlayBell() {
    const ctx = _m365GetAudioContext();
    if (!ctx) return Promise.resolve(0);

    const ready = ctx.state === 'running'
        ? Promise.resolve()
        : Promise.race([ctx.resume().catch(() => {}), new Promise(r => setTimeout(r, M365_AUDIO_RESUME_TIMEOUT_MS))]);
    return ready
        .then(() => {
            const blocked = ctx.state !== 'running';
            _m365SetAudioBlocked(blocked);
            if (blocked) return -1;
            return _m365LoadBell(ctx).then(buffer => _m365PlayBurst(ctx, buffer));
        })
        .catch(() => 0); // audio unavailable — fail silently
}

// Schedules M365_BELL_KNOCKS knocks; returns the burst length in ms
function _m365PlayBurst(ctx, buffer) {
    const step = buffer.duration + M365_BELL_KNOCK_GAP_MS / 1000;
    for (let i = 0; i < M365_BELL_KNOCKS; i++) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.start(ctx.currentTime + i * step);
    }
    return (step * (M365_BELL_KNOCKS - 1) + buffer.duration) * 1000;
}

// startTs defaults to the next event; pass one from the console to preview a phase,
// e.g. _m365StartAlertLoop(Date.now() + 20000) lands in the peak.
function _m365StartAlertLoop(startTs) {
    _m365StopAlertLoop();
    if (startTs === undefined) startTs = new Date(_m365State.nextEvent?.start).getTime();
    if (!Number.isFinite(startTs)) return;
    const token = {};
    _m365State.alertSoundTimer = token;

    function tick() {
        if (_m365State.alertSoundTimer !== token) return;
        if (Date.now() - startTs > M365_ALERT_WINDOW_MS) { _m365StopAlertLoop(); return; }
        _m365PlayBell().then(durationMs => {
            if (_m365State.alertSoundTimer !== token) return;
            // Audio still locked — retry soon so sound starts right after any click/keypress
            if (durationMs < 0) { token.timeout = setTimeout(tick, M365_AUDIO_RETRY_MS); return; }
            const offset = Date.now() - startTs;
            const { pauseMs } = M365_BELL_PHASES.find(p => offset < p.until);
            token.timeout = setTimeout(tick, durationMs + pauseMs);
        });
    }
    tick();
}

function _m365StopAlertLoop() {
    if (_m365State.alertSoundTimer) {
        clearTimeout(_m365State.alertSoundTimer.timeout);
        _m365State.alertSoundTimer = null;
    }
    _m365SetAudioBlocked(false);
}

function _m365ToggleBellMute() {
    const ev = _m365State.nextEvent;
    if (!ev) return;

    if (_m365State.alertAudioBlocked && _m365State.alertMutedForId !== ev.id) {
        // Click only unlocks audio (gesture) — play now instead of muting
        _m365UnlockAudio();
        if (_m365State.alertWindowActive) _m365StartAlertLoop();
        return;
    }

    if (_m365State.alertMutedForId === ev.id) {
        // Unmute — restart sound if still in window
        _m365State.alertMutedForId = null;
        if (_m365State.alertWindowActive) _m365StartAlertLoop();
    } else {
        // Mute — stop sound for this meeting
        _m365State.alertMutedForId = ev.id;
        _m365StopAlertLoop();
    }
    _m365RenderCompact();
}

function _m365CheckAlertState() {
    const ev = _m365State.nextEvent;

    if (!ev) {
        if (_m365State.alertWindowActive) {
            _m365State.alertWindowActive = false;
            _m365State.alertEventId = null;
            _m365StopAlertLoop();
            _m365RenderCompact();
        }
        return;
    }

    const now = Date.now();
    const startTs = new Date(ev.start).getTime();
    const inWindow = !ev.isAllDay && Number.isFinite(startTs) && now >= startTs - M365_ALERT_WINDOW_MS && now <= startTs + M365_ALERT_WINDOW_MS;
    const isMuted = _m365State.alertMutedForId === ev.id;

    // New window, or a different meeting took over while a window was active
    const isNewAlert = !_m365State.alertWindowActive || _m365State.alertEventId !== ev.id;

    if (inWindow && isNewAlert) {
        _m365State.alertWindowActive = true;
        _m365State.alertEventId = ev.id;
        _m365RenderCompact();
        if (isMuted) _m365StopAlertLoop();
        else _m365StartAlertLoop();

        // Fire a browser notification when the tab is in the background
        const cfg = _m365GetConfig();
        if (cfg.notificationsEnabled && _m365State.alertNotificationSentForId !== ev.id) {
            _m365State.alertNotificationSentForId = ev.id;
            const title = `${ICONS.bell} ${ev.subject || 'Bez tytułu'}`;
            const body = _m365EventDetailRows(ev)
                .filter(r => r.label !== 'Status' && r.label !== 'Time left')
                .map(r => `${r.label}: ${r.value}`)
                .join('\n');
            showNotification(title, body, { tag: `m365-meeting-${ev.id}`, icon: '/favicon.ico' });
        }
    } else if (!inWindow && _m365State.alertWindowActive) {
        _m365State.alertWindowActive = false;
        _m365State.alertEventId = null;
        _m365StopAlertLoop();
        _m365RenderCompact();
    }
}

const _M365_DEFAULT_CONFIG = {
    enabled: true,
    icsUrl: '',
    timezone: '',
    notificationsEnabled: false,
};

function _m365GetConfig() {
    const raw = (typeof m365CalendarConfig === 'object' && m365CalendarConfig) ? m365CalendarConfig : {};
    return {
        enabled: raw.enabled !== false,
        icsUrl: raw.icsUrl || '',
        timezone: raw.timezone || '',
        notificationsEnabled: raw.notificationsEnabled || false,
    };
}

function _m365SetConfig(nextConfig) {
    const merged = {
        ..._M365_DEFAULT_CONFIG,
        ...nextConfig,
    };
    m365CalendarConfig = merged;
    if (typeof saveSyncSettings === 'function') saveSyncSettings();
}

function _m365Esc(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _m365NormalizeUrl(raw) {
    return String(raw || '').trim().replace(/[\r\n\t]/g, '');
}

function _m365ValidateHttpUrl(raw) {
    const value = _m365NormalizeUrl(raw);
    if (!value) return { ok: true, value: '' };
    try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return { ok: false, message: 'URL must start with http:// or https://' };
        }
        return { ok: true, value: url.toString() };
    } catch {
        return { ok: false, message: 'Invalid URL format' };
    }
}

function _m365HasIcsSource() {
    const cfg = _m365GetConfig();
    const valid = _m365ValidateHttpUrl(cfg.icsUrl);
    return valid.ok && !!valid.value;
}

function _m365CanLoadCalendar() {
    const cfg = _m365GetConfig();
    return cfg.enabled && _m365HasIcsSource();
}

function _m365FmtTime(iso) {
    const date = new Date(iso);
    return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
}

function _m365FmtTimeRange(ev) {
    if (ev.isAllDay) return 'Full day';
    return `${_m365FmtTime(ev.start)}-${_m365FmtTime(ev.end)} (${_m365Duration(ev.start, ev.end)})`;
}

function _m365Duration(startIso, endIso) {
    const mins = Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
}

function _m365TimeUntilStart(startIso) {
    const startTs = new Date(startIso).getTime();
    if (!Number.isFinite(startTs)) return '';

    const diffMs = startTs - Date.now();
    if (diffMs <= 0) return '';

    const mins = Math.ceil(diffMs / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
}

// Badge shown only when the next meeting starts within this many minutes
const M365_FAVICON_HORIZON_MIN = 4 * 60;

// Once the current meeting has run this long, favicon/title move on to the next one
const M365_FAVICON_ELAPSED_MAX_MIN = 15;

// Meeting the favicon/title count towards: current one for its first 15 min, then upcoming
function _m365IndicatorEvent() {
    const pick = (ev) => (ev && !ev.isAllDay ? ev : null);
    const ev = pick(_m365State.nextEvent);
    if (!ev) return null;
    const now = Date.now();
    const startTs = new Date(ev.start).getTime();
    const ended = new Date(ev.end).getTime() < now;
    const elapsedMin = Math.floor((now - startTs) / 60000);
    if (ended || elapsedMin > M365_FAVICON_ELAPSED_MAX_MIN) {
        const up = pick(_m365State.upcomingEvent);
        return up && up.id !== ev.id ? up : null;
    }
    return ev;
}

// Favicon badge: digits + unit letter; level drives colour (far → soon → urgent)
// In progress: 0m, -1m … -15m
function _m365FaviconBadge(ev) {
    const now = Date.now();
    const startTs = new Date(ev.start).getTime();
    if (!Number.isFinite(startTs)) return null;
    if (startTs <= now) {
        const elapsed = Math.floor((now - startTs) / 60000);
        return { text: elapsed ? `-${elapsed}` : '0', unit: 'm', level: 'urgent' };
    }

    const mins = Math.ceil((startTs - now) / 60000);
    if (mins >= M365_FAVICON_HORIZON_MIN) return null;
    if (mins >= 60) return { text: String(Math.floor(mins / 60)), unit: 'h', level: 'far' };
    return { text: String(mins), unit: 'm', level: mins <= 5 ? 'urgent' : 'soon' };
}

// Badge fill per level: green ≥1h, orange <1h, red ≤5m / in progress
const _M365_FAVICON_FILL = { far: '--success', soon: '--warning', urgent: '--danger' };

const _M365_FAVICON_FONT_FAMILY = 'Inter, Arial, Helvetica, sans-serif';

let _m365DefaultFaviconHref = null;
let _m365FaviconImg = null;

function _m365LoadFaviconImg(src) {
    if (!_m365FaviconImg) {
        _m365FaviconImg = new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }
    return _m365FaviconImg;
}

// Gmail-style: original icon + countdown badge in the bottom-right corner
async function _m365UpdateFavicon() {
    const link = document.querySelector('link[rel="icon"]');
    if (!link) return;
    if (_m365DefaultFaviconHref === null) _m365DefaultFaviconHref = link.getAttribute('href');

    const ev = _m365GetConfig().enabled ? _m365IndicatorEvent() : null;
    const badge = ev ? _m365FaviconBadge(ev) : null;

    let href = _m365DefaultFaviconHref;
    if (badge) {
        try {
            const img = await _m365LoadFaviconImg(_m365DefaultFaviconHref);
            // Canvas won't trigger @font-face loading itself
            await document.fonts.load('900 46px Inter').catch(() => {});
            const size = 64;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, size, size);

            const css = getComputedStyle(document.body);
            const bgVar = _M365_FAVICON_FILL[badge.level];
            const fgVar = '--bg';

            // <1h: badge covers the whole icon; otherwise Gmail-style corner badge
            const big = badge.level !== 'far';
            const numPx = big ? 46 : 36;
            const numFont = `900 ${numPx}px ${_M365_FAVICON_FONT_FAMILY}`;
            const unitFont = `900 ${big ? 32 : 26}px ${_M365_FAVICON_FONT_FAMILY}`;
            ctx.font = numFont;
            const numW = ctx.measureText(badge.text).width;
            ctx.font = unitFont;
            const unitW = badge.unit ? ctx.measureText(badge.unit).width : 0;
            const pad = 6;
            const h = big ? size : 38;
            const w = big ? size : Math.min(size, Math.max(h, numW + unitW + pad * 2));
            const x = size - w;
            const y = size - h;
            ctx.fillStyle = css.getPropertyValue(bgVar).trim();
            ctx.strokeStyle = css.getPropertyValue('--bg').trim();
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 10);
            ctx.stroke();
            ctx.fill();

            // Shrink text (both axes) to keep a `pad` margin from the badge edge
            const scale = Math.min(1, (w - pad * 2) / (numW + unitW));
            const baseline = y + h / 2 + numPx * 0.36 * scale;
            ctx.save();
            ctx.translate(x + w / 2 - ((numW + unitW) * scale) / 2, baseline);
            ctx.scale(scale, scale);
            ctx.fillStyle = css.getPropertyValue(fgVar).trim();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.font = numFont;
            ctx.fillText(badge.text, 0, 0);
            ctx.font = unitFont;
            ctx.fillText(badge.unit, numW, 0);
            ctx.restore();
            href = canvas.toDataURL('image/png');
        } catch {
            href = _m365DefaultFaviconHref;
        }
    }
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
}

let _m365DefaultTitle = null;

// Title countdown, no horizon: '1d 3h', '2h 15m', '6m' ('' when not upcoming)
function _m365TitleCountdown(ev) {
    const startTs = new Date(ev.start).getTime();
    if (!Number.isFinite(startTs)) return '';
    const mins = Math.ceil((startTs - Date.now()) / 60000);
    if (mins <= 0) return '';
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (d) return h ? `${d}d ${h}h` : `${d}d`;
    if (h) return m ? `${h}h ${m}m` : `${h}h`;
    return `${m}m`;
}

// Tab title countdown (Arc shows it on favourite hover): 'in 6m · Speed Dial…'
function _m365UpdateTitle() {
    if (_m365DefaultTitle === null) _m365DefaultTitle = document.title;

    const ev = _m365GetConfig().enabled ? _m365IndicatorEvent() : null;
    let title = _m365DefaultTitle;
    if (ev) {
        const elapsed = Math.floor((Date.now() - new Date(ev.start).getTime()) / 60000);
        const countdown = _m365TitleCountdown(ev);
        if (countdown) title = `in ${countdown} · ${_m365DefaultTitle}`;
        else if (elapsed >= 0) title = `${elapsed ? `started ${elapsed}m ago` : 'now'} · ${_m365DefaultTitle}`;
    }
    if (document.title !== title) document.title = title;
}

function _m365IsWithinNextMinutes(iso, minutes) {
    const ts = new Date(iso).getTime();
    if (!Number.isFinite(ts)) return false;
    const diff = ts - Date.now();
    return diff > 0 && diff < minutes * 60 * 1000;
}

function _m365FmtDate(iso) {
    const date = new Date(iso);
    return new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date);
}

function _m365NormalizeBodyPreview(raw) {
    const text = String(raw || '').replace(/\r\n/g, '\n').trim();
    if (!text) return { text: '', hasSeparator: false };

    const separator = text.match(/^_{20,}\s*/);
    if (!separator) return { text, hasSeparator: false };

    return {
        text: text.slice(separator[0].length).trimStart(),
        hasSeparator: true,
    };
}

function _m365BuildRequest(endpoint, extraPayload = {}) {
    const cfg = _m365GetConfig();
    const splitIndex = endpoint.indexOf('?');
    const path = splitIndex >= 0 ? endpoint.slice(0, splitIndex) : endpoint;
    const baseQuery = splitIndex >= 0 ? endpoint.slice(splitIndex + 1) : '';
    const params = new URLSearchParams(baseQuery);
    const payload = {
        ...extraPayload,
    };

    payload.source = 'ics';

    const validIcs = _m365ValidateHttpUrl(cfg.icsUrl);
    if (validIcs.ok && validIcs.value) {
        payload.icsUrl = validIcs.value;
    }
    if (cfg.timezone) payload.timezone = cfg.timezone;

    if (params.get('days')) payload.days = Number(params.get('days'));
    if (params.get('workingDays')) payload.workingDays = params.get('workingDays') === 'true';
    if (params.get('eventId')) payload.eventId = params.get('eventId');

    return {
        url: path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    };
}

async function _m365FetchJson(endpoint, extraPayload = {}) {
    const request = _m365BuildRequest(endpoint, extraPayload);
    let response;
    try {
        response = await fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.body,
        });
    } catch (error) {
        throw new Error(error?.message || 'Network request failed');
    }
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return response.json();
}

function _m365HideDetails() {
    _m365State.detailsPopover?.classList.remove('open');
}

function _m365HideAgenda() {
    _m365State.agendaPopover?.classList.remove('open');
    _m365HideDetails();
}

function _m365UpdateIcsIndicator() {
    const btn = document.getElementById('icsIndicator');
    if (!btn) return;

    const cfg = _m365GetConfig();
    let cls = '';
    let label = '';

    if (!cfg.enabled) {
        label = 'ICS Calendar integration: disabled';
    } else if (!_m365HasIcsSource()) {
        label = 'ICS Calendar integration: not configured (no ICS URL)';
    } else if (_m365State.icsFetchInFlight > 0) {
        cls = 'updating';
        label = 'ICS Calendar integration: updating…';
    } else if (_m365State.icsLastError) {
        cls = 'conflict';
        label = `ICS Calendar integration: error — ${_m365State.icsLastError}`;
    } else if (_m365State.icsEverLoaded) {
        cls = 'connected';
        label = 'ICS Calendar integration: active';
    } else {
        label = 'ICS Calendar integration: not yet loaded';
    }

    btn.className = 'gdrive-indicator' + (cls ? ` ${cls}` : '');
    btn.dataset.label = label;
}

function _m365ApplyEnabledState() {
    const root = _m365State.compact?.closest('.header-m365-col');
    if (!root) return;
    const cfg = _m365GetConfig();
    root.style.display = cfg.enabled ? '' : 'none';
    if (!cfg.enabled) _m365HideAgenda();
    _m365UpdateIcsIndicator();
}

function _m365RenderCompact() {
    _m365UpdateFavicon();
    _m365UpdateTitle();
    const target = _m365State.compact;
    if (!target) return;

    const cfg = _m365GetConfig();
    if (!cfg.enabled) {
        target.classList.remove('has-event');
        target.innerHTML = '<span class="m365-label">Next</span><span class="m365-empty">Widget disabled</span>';
        return;
    }

    if (!_m365HasIcsSource()) {
        target.classList.remove('has-event');
        target.innerHTML = '<span class="m365-label">Next</span><span class="m365-empty">Integration disabled (no ICS URL)</span>';
        return;
    }

    const allDayBadge = _m365State.allDayToday
        ? `<span class="m365-allday-badge" title="Full-day event today: ${_m365Esc(_m365State.allDayToday.subject)}">${ICONS.allDay}</span>`
        : '';

    const ev = _m365State.nextEvent;
    if (!ev) {
        target.classList.remove('has-event');
        target.innerHTML = [
            `<span class="m365-label">Next${allDayBadge}</span>`,
            _m365State.compactRefreshing ? '<span class="m365-loading-inline m365-loading-inline--compact" aria-label="Loading calendar" title="Loading calendar"></span>' : '',
            '<span class="m365-empty">No meeting</span>',
        ].join('');
        return;
    }

    const inProgress = new Date(ev.start) <= new Date() && new Date(ev.end) >= new Date();
    const countdown = !inProgress ? _m365TimeUntilStart(ev.start) : '';
    const startsSoon = inProgress || _m365IsWithinNextMinutes(ev.start, 5);
    const isBellMuted = _m365State.alertMutedForId === ev.id;
    const isAudioBlocked = !isBellMuted && _m365State.alertAudioBlocked;
    const bellTitle = isBellMuted
        ? 'Sound muted — click to re-enable'
        : isAudioBlocked
            ? 'Sound blocked by browser — click to enable'
            : 'Meeting alert active — click to mute';
    const bellHtml = _m365State.alertWindowActive
        ? `<button class="m365-bell-btn${isBellMuted ? ' m365-bell-btn--muted' : ''}${isAudioBlocked ? ' m365-bell-btn--blocked' : ''}" type="button" data-bell="1" aria-label="${bellTitle}" title="${bellTitle}">${isBellMuted ? ICONS.bellMuted : ICONS.bell}</button>`
        : '';
    const overlapHtml = _m365State.overlapCount > 1
        ? `<span class="m365-overlap-badge" title="${_m365State.overlapCount} overlapping meetings">(${_m365State.overlapCount})</span>`
        : '';
    target.classList.add('has-event');
    target.innerHTML = [
        `<span class="m365-compact-row">
             <span class="m365-label">Next${allDayBadge}</span>
             <span class="m365-time">${_m365FmtTimeRange(ev)}</span>
             ${overlapHtml}
             ${countdown ? `<span class="m365-countdown">Starts in ${countdown}</span>` : ''}
             <span class="m365-actions-group">
                 ${inProgress ? '<span class="m365-state m365-state-badge">In progress</span>' : ''}
                 ${ev.joinUrl
                     ? `<a class="m365-join-btn${startsSoon ? ' m365-join-btn--soon' : ''}" href="${_m365Esc(ev.joinUrl)}" target="_blank" rel="noopener noreferrer">Join</a>`
                     : '<span class="m365-join-offline" aria-label="In person meeting">In person</span>'}
                 ${bellHtml}
             </span>
         </span>`,
        _m365State.compactRefreshing ? '<span class="m365-loading-inline m365-loading-inline--compact" aria-label="Loading calendar" title="Loading calendar"></span>' : '',
        `<span class="m365-subject">${_m365Esc(ev.subject)}</span>`,
    ].join('');
}

function _m365BeginCompactRefresh() {
    _m365State.compactRefreshInFlight += 1;
    _m365State.compactRefreshing = _m365State.compactRefreshInFlight > 0;
    _m365RenderCompact();
}

function _m365EndCompactRefresh() {
    _m365State.compactRefreshInFlight = Math.max(0, _m365State.compactRefreshInFlight - 1);
    _m365State.compactRefreshing = _m365State.compactRefreshInFlight > 0;
    _m365RenderCompact();
}

function _m365RenderAgenda() {
    const body = _m365State.agendaBody;
    if (!body) {
        console.warn('[m365] agendaBody element not found');
        return;
    }

    if (!_m365State.agendaDays.length) {
        const cfg = _m365GetConfig();
        if (cfg.enabled && !_m365HasIcsSource()) {
            body.innerHTML = '<div class="m365-empty-block">Integration disabled (no ICS URL).</div>';
            return;
        }
        body.innerHTML = '<div class="m365-empty-block">No meetings in upcoming working days.</div>';
        return;
    }

    body.innerHTML = _m365State.agendaDays.map((day) => {
        const items = day.items.map((ev) => `
            <button class="m365-agenda-item" type="button" data-event-id="${_m365Esc(ev.id)}">
                <span class="m365-agenda-row">
                    <span class="m365-agenda-time">${_m365FmtTimeRange(ev)}</span>
                    ${ev.joinUrl
                        ? `<a class="m365-join-btn" href="${_m365Esc(ev.joinUrl)}" target="_blank" rel="noopener noreferrer">Join</a>`
                        : '<span class="m365-join-offline" aria-label="In person meeting">In person</span>'}
                </span>
                <span class="m365-agenda-title">${_m365Esc(ev.subject)}</span>
            </button>
        `).join('');
        return `<section class="m365-day"><h4>${_m365Esc(day.dayLabel)}</h4>${items}</section>`;
    }).join('');
}

// Label/value rows shared by the details popover and the OS notification
function _m365EventDetailRows(ev) {
    const now = Date.now();
    const startTs = new Date(ev.start).getTime();
    const endTs = new Date(ev.end).getTime();
    const inProgress = Number.isFinite(startTs) && Number.isFinite(endTs) && startTs <= now && endTs >= now;
    const startsIn = !ev.isAllDay && startTs > now ? _m365TimeUntilStart(ev.start) : '';
    const timeLeft = !ev.isAllDay && inProgress ? _m365TimeUntilStart(ev.end) : '';
    const statusLabel = inProgress ? 'In progress' : (startTs > now ? 'Upcoming' : 'Finished');
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';

    return [
        { label: 'Date', value: _m365FmtDate(ev.start) },
        { label: 'Time', value: _m365FmtTimeRange(ev) },
        startsIn && { label: 'Starts in', value: startsIn },
        timeLeft && { label: 'Time left', value: timeLeft },
        { label: 'Status', value: statusLabel },
        { label: 'Type', value: ev.joinUrl ? 'Online meeting' : 'In person' },
        { label: 'Timezone', value: _m365GetConfig().timezone || localTz },
        { label: 'Location', value: ev.location || '-' },
        { label: 'Organizer', value: ev.organizer || '-' },
    ].filter(Boolean);
}

function _m365RenderDetails(eventData) {
    const body = _m365State.detailsBody;
    const headActions = _m365State.detailsHeadActions;
    if (!body || !eventData) return;
    const preview = _m365NormalizeBodyPreview(eventData.bodyPreview);

    if (headActions) {
        headActions.innerHTML = eventData.joinUrl
            ? `<a class="m365-join-btn m365-join-btn--lg" href="${_m365Esc(eventData.joinUrl)}" target="_blank" rel="noopener noreferrer">Join meeting</a>`
            : '<span class="m365-join-offline m365-join-offline--lg" aria-label="In person meeting">In person</span>';
    }

    body.innerHTML = `
        <h4>${_m365Esc(eventData.subject)}</h4>
        ${_m365EventDetailRows(eventData).map(r =>
            `<div class="m365-detail-row"><strong>${r.label}:</strong> ${_m365Esc(r.value)}</div>`
        ).join('')}
        ${preview.text
            ? `<div class="m365-body-preview-wrap${preview.hasSeparator ? ' has-separator' : ''}">
                ${preview.hasSeparator ? '<div class="m365-body-separator" aria-hidden="true"></div>' : ''}
                <p class="m365-body-preview">${_m365Esc(preview.text)}</p>
            </div>`
            : ''}
    `;

    _m365State.detailsPopover?.classList.add('open');
}

async function _m365LoadNext() {
    if (!_m365GetConfig().enabled) return;
    if (!_m365CanLoadCalendar()) {
        _m365State.nextEvent = null;
        _m365State.upcomingEvent = null;
        _m365State.allDayToday = null;
        _m365State.hasNextCache = false;
        _m365State.compactRefreshInFlight = 0;
        _m365State.compactRefreshing = false;
        _m365RenderCompact();
        _m365UpdateIcsIndicator();
        return;
    }
    const useInlineRefresh = _m365State.hasNextCache;
    if (useInlineRefresh) {
        _m365BeginCompactRefresh();
    } else {
        _m365ShowCompactLoading();
    }
    _m365State.icsFetchInFlight += 1;
    _m365UpdateIcsIndicator();
    try {
        const payload = await _m365FetchJson('/api/m365/calendar/next');
        _m365State.nextEvent = payload.next;
        _m365State.upcomingEvent = payload.upcoming || null;
        _m365State.allDayToday = payload.allDayToday;
        _m365State.overlapCount = payload.overlapCount || 0;
        _m365State.hasNextCache = true;
        _m365State.icsLastError = null;
        _m365State.icsEverLoaded = true;
        // Update alert state whenever event data changes
        _m365CheckAlertState();
    } catch (error) {
        if (!_m365State.hasNextCache) {
            _m365State.nextEvent = null;
        }
        _m365State.icsLastError = error?.message || 'unknown error';
        throw error;
    } finally {
        _m365State.icsFetchInFlight = Math.max(0, _m365State.icsFetchInFlight - 1);
        _m365UpdateIcsIndicator();
        if (useInlineRefresh) {
            _m365EndCompactRefresh();
        } else {
            _m365RenderCompact();
        }
    }
}

async function _m365LoadAgenda(forceOpen = false) {
    if (!_m365GetConfig().enabled) return;
    if (!_m365CanLoadCalendar()) {
        _m365State.agendaDays = [];
        _m365State.hasAgendaCache = false;
        _m365RenderCompact();
        _m365RenderAgenda();
        _m365UpdateIcsIndicator();
        return;
    }
    const useInlineRefresh = _m365State.hasAgendaCache;
    if (useInlineRefresh) _m365BeginCompactRefresh();
    _m365State.icsFetchInFlight += 1;
    _m365UpdateIcsIndicator();
    try {
        const payload = await _m365FetchJson('/api/m365/calendar/agenda?days=5&workingDays=true');
        _m365State.agendaDays = payload.days || [];
        _m365State.hasAgendaCache = true;
        _m365State.icsLastError = null;
        _m365State.icsEverLoaded = true;
        _m365RenderCompact();
        _m365RenderAgenda();
        if (forceOpen) _m365State.agendaPopover?.classList.add('open');
    } catch (error) {
        _m365State.icsLastError = error?.message || 'unknown error';
        throw error;
    } finally {
        _m365State.icsFetchInFlight = Math.max(0, _m365State.icsFetchInFlight - 1);
        _m365UpdateIcsIndicator();
        if (useInlineRefresh) _m365EndCompactRefresh();
    }
}

function _m365ShowAgendaLoading() {
    const body = _m365State.agendaBody;
    if (!body) return;
    body.innerHTML = '<div class="m365-loading">Loading calendar…</div>';
}

function _m365ShowCompactLoading() {
    const target = _m365State.compact;
    if (!target) return;
    target.classList.remove('has-event');
    target.innerHTML = '<span class="m365-label">Next</span><span class="m365-loading-inline">Loading calendar…</span>';
}

function _m365ShowDetailsLoading() {
    const body = _m365State.detailsBody;
    if (!body) return;
    if (_m365State.detailsHeadActions) _m365State.detailsHeadActions.innerHTML = '';
    body.innerHTML = '<div class="m365-loading">Loading meeting details…</div>';
    _m365State.detailsPopover?.classList.add('open');
}

async function _m365OpenDetails(eventId) {
    if (!eventId) return;
    const cached = _m365State.detailsCache[eventId];
    if (cached) _m365BeginCompactRefresh();
    if (cached) {
        _m365RenderDetails(cached);
    } else {
        _m365ShowDetailsLoading();
    }
    try {
        const payload = await _m365FetchJson(`/api/m365/calendar/event?eventId=${encodeURIComponent(eventId)}`);
        if (!payload.event) {
            if (!cached && _m365State.detailsBody) {
                _m365State.detailsBody.innerHTML = '<div class="m365-empty-block">Meeting details unavailable.</div>';
            }
            return;
        }
        if (payload.event.id) _m365State.detailsCache[payload.event.id] = payload.event;
        _m365RenderDetails(payload.event);
    } catch (error) {
        if (!cached && _m365State.detailsBody) {
            _m365State.detailsBody.innerHTML = '<div class="m365-empty-block">Meeting details unavailable.</div>';
        }
        throw error;
    } finally {
        if (cached) _m365EndCompactRefresh();
    }
}

function _m365ScheduleRefresh() {
    if (_m365State.compactTimer) clearInterval(_m365State.compactTimer);
    if (_m365State.agendaTimer) clearInterval(_m365State.agendaTimer);
    if (_m365State.countdownTimer) clearInterval(_m365State.countdownTimer);
    if (_m365State.alertCheckTimer) clearInterval(_m365State.alertCheckTimer);

    if (!_m365CanLoadCalendar()) return;

    _m365State.countdownTimer = setInterval(() => {
        if (_m365State.nextEvent) _m365RenderCompact();
    }, 60 * 1000);

    _m365State.compactTimer = setInterval(() => {
        _m365LoadNext().catch((error) => console.warn('[m365] compact refresh failed:', error.message));
    }, 90 * 1000);

    _m365State.agendaTimer = setInterval(() => {
        _m365LoadAgenda(false).catch((error) => console.warn('[m365] agenda refresh failed:', error.message));
    }, 5 * 60 * 1000);

    // Check alert window every 10 s — drives the meeting bell/sound
    _m365State.alertCheckTimer = setInterval(_m365CheckAlertState, 10 * 1000);
    _m365CheckAlertState(); // immediate check
}

function _setM365EnabledToggle(active) {
    const toggle = document.getElementById('m365EnabledToggle');
    if (!toggle) return;
    toggle.classList.toggle('active', !!active);
}

function toggleM365CalendarEnabled() {
    const current = _m365GetConfig();
    _m365SetConfig({ ...current, enabled: !current.enabled });
    _setM365EnabledToggle(!current.enabled);
}

function _m365PopulateTimezoneList() {
    const list = document.getElementById('m365TimezoneList');
    if (!list || list.dataset.populated === '1') return;
    try {
        const zones = Intl.supportedValuesOf('timeZone');
        list.innerHTML = zones.map((tz) => `<option value="${_m365Esc(tz)}"></option>`).join('');
        list.dataset.populated = '1';
    } catch {
        // Intl.supportedValuesOf not available — datalist stays empty, free-text still works
    }
}

function _setM365NotificationsToggle(active) {
    const toggle = document.getElementById('m365NotificationsToggle');
    if (!toggle) return;
    toggle.classList.toggle('active', !!active);
}

function _m365UpdateNotificationsPermissionUI() {
    const statusEl = document.getElementById('m365NotificationsPermStatus');
    if (!statusEl) return;
    if (!('Notification' in window)) {
        statusEl.textContent = `${ICONS.warn} Ten browser nie obsługuje powiadomień`;
        statusEl.dataset.state = 'unsupported';
        return;
    }
    const perm = Notification.permission;
    if (perm === 'granted') {
        statusEl.textContent = `${ICONS.ok} Zgoda udzielona — powiadomienia działają`;
        statusEl.dataset.state = 'granted';
    } else if (perm === 'denied') {
        statusEl.textContent = `${ICONS.error} Dostęp zablokowany — odblokuj w ustawieniach przeglądarki`;
        statusEl.dataset.state = 'denied';
    } else {
        statusEl.textContent = `Kliknij „Zezwól" aby włączyć powiadomienia systemowe`;
        statusEl.dataset.state = 'default';
    }
}

async function _m365RequestNotificationPermission() {
    const perm = await requestNotificationPermission();
    _m365UpdateNotificationsPermissionUI();
    if (perm === 'granted') {
        _setM365NotificationsToggle(true);
        const cfg = _m365GetConfig();
        _m365SetConfig({ ...cfg, notificationsEnabled: true });
    }
}

function toggleM365Notifications() {
    const current = _m365GetConfig();
    const toggle = document.getElementById('m365NotificationsToggle');
    if (!toggle) return;
    const willEnable = !current.notificationsEnabled;

    if (willEnable && Notification.permission !== 'granted') {
        // Need to request permission first — toggle stays off until granted
        _m365RequestNotificationPermission();
        return;
    }
    _m365SetConfig({ ...current, notificationsEnabled: willEnable });
    _setM365NotificationsToggle(willEnable);
}

function openM365ConfigModal() {
    const cfg = _m365GetConfig();
    const icsInput = document.getElementById('m365IcsUrlInput');
    const timezone = document.getElementById('m365TimezoneInput');
    const status = document.getElementById('m365CfgStatus');
    if (!icsInput || !timezone || !status) return;

    _m365PopulateTimezoneList();
    icsInput.value = cfg.icsUrl;
    timezone.value = cfg.timezone;
    status.textContent = '';
    _setM365EnabledToggle(cfg.enabled);
    _setM365NotificationsToggle(cfg.notificationsEnabled);
    _m365UpdateNotificationsPermissionUI();
    openModal('m365ConfigModal');
}

async function _saveM365ConfigFromModal() {
    const icsInput = document.getElementById('m365IcsUrlInput');
    const timezone = document.getElementById('m365TimezoneInput');
    const status = document.getElementById('m365CfgStatus');
    if (!icsInput || !timezone || !status) return;

    const cfg = _m365GetConfig();
    const nextConfig = {
        enabled: cfg.enabled,
        icsUrl: _m365NormalizeUrl(icsInput.value),
        timezone: timezone.value.trim(),
        notificationsEnabled: document.getElementById('m365NotificationsToggle')?.classList.contains('active') || false,
    };

    const icsValidation = _m365ValidateHttpUrl(nextConfig.icsUrl);
    if (!icsValidation.ok) {
        status.textContent = `${ICONS.warn} ${icsValidation.message}`;
        return;
    }
    nextConfig.icsUrl = icsValidation.value;

    if (nextConfig.timezone) {
        try {
            Intl.DateTimeFormat(undefined, { timeZone: nextConfig.timezone });
        } catch {
            status.textContent = `${ICONS.warn} Invalid timezone — pick one from the list or leave empty`;
            return;
        }
    }

    _m365SetConfig(nextConfig);
    _m365ApplyEnabledState();
    _m365ScheduleRefresh();

    const msg = !nextConfig.enabled
        ? `${ICONS.ok} M365 widget disabled`
        : (!nextConfig.icsUrl
            ? `${ICONS.warn} ICS URL removed - integration disabled`
            : `${ICONS.ok} M365 settings saved`);
    status.textContent = msg;
    setTimeout(() => closeModal('m365ConfigModal'), 400);

    if (nextConfig.enabled && nextConfig.icsUrl) {
        _m365LoadNext().catch((err) => console.warn('[m365] post-save refresh failed:', err.message));
        _m365LoadAgenda(false).catch(() => {});
    } else {
        _m365State.nextEvent = null;
        _m365State.agendaDays = [];
        _m365State.detailsCache = {};
        _m365State.hasNextCache = false;
        _m365State.hasAgendaCache = false;
        _m365State.compactRefreshing = false;
        _m365State.compactRefreshInFlight = 0;
        _m365RenderCompact();
        _m365RenderAgenda();
    }
}

function _bindM365ConfigModal() {
    const saveBtn = document.getElementById('m365SaveBtn');
    if (!saveBtn || saveBtn.dataset.bound === '1') return;
    saveBtn.dataset.bound = '1';
    saveBtn.addEventListener('click', _saveM365ConfigFromModal);
}

function initM365Calendar() {
    _m365State.compact = document.getElementById('m365Compact');
    _m365State.agendaPopover = document.getElementById('m365AgendaPopover');
    _m365State.detailsPopover = document.getElementById('m365DetailsPopover');
    _m365State.agendaBody = document.getElementById('m365AgendaBody');
    _m365State.detailsBody = document.getElementById('m365DetailsBody');
    _m365State.detailsHeadActions = document.getElementById('m365DetailsHeadActions');
    const detailsCloseBtn = document.getElementById('m365DetailsCloseBtn');
    _bindM365ConfigModal();

    if (detailsCloseBtn && detailsCloseBtn.dataset.bound !== '1') {
        detailsCloseBtn.dataset.bound = '1';
        detailsCloseBtn.addEventListener('click', () => _m365HideDetails());
    }

    if (_m365State.detailsPopover && _m365State.detailsPopover.dataset.bound !== '1') {
        _m365State.detailsPopover.dataset.bound = '1';
        _m365State.detailsPopover.addEventListener('click', (event) => {
            if (event.target === _m365State.detailsPopover) _m365HideDetails();
        });
    }

    if (!document.body.dataset.m365DetailsEscBound) {
        document.body.dataset.m365DetailsEscBound = '1';
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            if (_m365State.detailsPopover?.classList.contains('open')) _m365HideDetails();
        });
    }

    if (!_m365State.compact || !_m365State.agendaPopover) {
        console.warn('[m365] Missing DOM elements: compact=%o, agendaPopover=%o', _m365State.compact, _m365State.agendaPopover);
        return;
    }
    _m365ApplyEnabledState();
    _m365UpdateIcsIndicator();

    _m365State.compact.addEventListener('click', async (event) => {
        if (event.target.closest('.m365-join-btn')) return;
        // Bell mute toggle — stop propagation so agenda doesn't open
        if (event.target.closest('[data-bell]')) {
            _m365ToggleBellMute();
            return;
        }
        const willOpen = !_m365State.agendaPopover.classList.contains('open');
        if (!willOpen) {
            _m365HideAgenda();
            return;
        }

        if (!_m365State.hasAgendaCache) _m365ShowAgendaLoading();
        _m365State.agendaPopover.classList.add('open');

        try {
            await _m365LoadAgenda(false);
        } catch (error) {
            showToast(`${ICONS.warn} Calendar unavailable`);
            console.warn('[m365] Failed to open agenda:', error.message);
        }
    });

    _m365State.agendaBody?.addEventListener('click', (event) => {
        if (event.target.closest('.m365-join-btn')) return;
        const btn = event.target.closest('.m365-agenda-item');
        if (!btn) return;
        _m365OpenDetails(btn.dataset.eventId).catch((error) => {
            showToast(`${ICONS.warn} Cannot load details`);
            console.warn('[m365] Details failed:', error.message);
        });
    });

    document.addEventListener('click', (event) => {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        const target = event.target;

        if (!path.length && target instanceof Element) {
            if (target.closest('#m365DetailsPopover')) return;
            if (!target.closest('.header-m365-col')) _m365HideAgenda();
            return;
        }

        const clickedInsideDetails = path.some((node) => node instanceof Element && node.id === 'm365DetailsPopover');
        if (clickedInsideDetails) return;

        const clickedInsideM365 = path.some((node) => node instanceof Element && (
            node.classList.contains('header-m365-col')
            || node.id === 'm365Compact'
            || node.id === 'm365AgendaPopover'
            || node.id === 'm365AgendaBody'
        ));

        if (!clickedInsideM365) _m365HideAgenda();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            _m365LoadNext().catch(() => {});
            _m365LoadAgenda(false).catch(() => {});
            _m365CheckAlertState();
        }
    });

    if (_m365GetConfig().enabled) {
        _m365LoadNext().catch((error) => console.warn('[m365] initial compact failed:', error.message));
        _m365LoadAgenda(false).catch(() => {});
    }
    _m365ScheduleRefresh();
}
