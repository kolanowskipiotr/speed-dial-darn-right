let _m365State = {
    compact: null,
    agendaPopover: null,
    detailsPopover: null,
    agendaBody: null,
    detailsBody: null,
    detailsHeadActions: null,
    nextEvent: null,
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

function _m365PlayBell() {
    const ctx = _m365GetAudioContext();
    if (!ctx) return;

    function doPlay() {
        try {
            const now = ctx.currentTime;

            function beep(startTime, freq, duration, vol) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(vol, startTime + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                osc.start(startTime);
                osc.stop(startTime + duration + 0.02);
            }

            // "Ding … Dong" — two tones ~500ms apart
            beep(now,        880, 0.45, 0.28);
            beep(now + 0.55, 660, 0.45, 0.22);
        } catch (e) {
            // audio unavailable — fail silently
        }
    }

    if (ctx.state === 'suspended') {
        ctx.resume().then(doPlay).catch(() => {});
    } else {
        doPlay();
    }
}

function _m365StartAlertLoop() {
    _m365StopAlertLoop();
    _m365PlayBell();
    _m365State.alertSoundTimer = setInterval(_m365PlayBell, 4000);
}

function _m365StopAlertLoop() {
    if (_m365State.alertSoundTimer) {
        clearInterval(_m365State.alertSoundTimer);
        _m365State.alertSoundTimer = null;
    }
}

function _m365ToggleBellMute() {
    const ev = _m365State.nextEvent;
    if (!ev) return;

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
            _m365StopAlertLoop();
            _m365RenderCompact();
        }
        return;
    }

    const now = Date.now();
    const startTs = new Date(ev.start).getTime();
    const WINDOW_MS = 3 * 60 * 1000; // 3 minutes
    const inWindow = Number.isFinite(startTs) && now >= startTs - WINDOW_MS && now <= startTs + WINDOW_MS;
    const isMuted = _m365State.alertMutedForId === ev.id;

    if (inWindow && !_m365State.alertWindowActive) {
        _m365State.alertWindowActive = true;
        _m365RenderCompact();
        if (!isMuted) _m365StartAlertLoop();

        // Fire a browser notification when the tab is in the background
        const cfg = _m365GetConfig();
        if (cfg.notificationsEnabled && _m365State.alertNotificationSentForId !== ev.id) {
            _m365State.alertNotificationSentForId = ev.id;
            const timeStr = _m365FmtTime(ev.start);
            const title = `${ICONS.bell} Spotkanie za chwilę`;
            const body = `${ev.title || 'Bez tytułu'} · ${timeStr}`;
            showNotification(title, body, { tag: `m365-meeting-${ev.id}`, icon: '/favicon.ico' });
        }
    } else if (!inWindow && _m365State.alertWindowActive) {
        _m365State.alertWindowActive = false;
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

    const ev = _m365State.nextEvent;
    if (!ev) {
        target.classList.remove('has-event');
        target.innerHTML = [
            '<span class="m365-label">Next</span>',
            _m365State.compactRefreshing ? '<span class="m365-loading-inline m365-loading-inline--compact" aria-label="Loading calendar" title="Loading calendar"></span>' : '',
            '<span class="m365-empty">No meeting</span>',
        ].join('');
        return;
    }

    const inProgress = new Date(ev.start) <= new Date() && new Date(ev.end) >= new Date();
    const countdown = !inProgress ? _m365TimeUntilStart(ev.start) : '';
    const startsSoon = inProgress || _m365IsWithinNextMinutes(ev.start, 5);
    const isBellMuted = _m365State.alertMutedForId === ev.id;
    const bellTitle = isBellMuted ? 'Sound muted — click to re-enable' : 'Meeting alert active — click to mute';
    const bellHtml = _m365State.alertWindowActive
        ? `<button class="m365-bell-btn${isBellMuted ? ' m365-bell-btn--muted' : ''}" type="button" data-bell="1" aria-label="${bellTitle}" title="${bellTitle}">${isBellMuted ? ICONS.bellMuted : ICONS.bell}</button>`
        : '';
    target.classList.add('has-event');
    target.innerHTML = [
        `<span class="m365-compact-row">
             <span class="m365-label">Next</span>
             <span class="m365-time">${_m365FmtTime(ev.start)}-${_m365FmtTime(ev.end)} (${_m365Duration(ev.start, ev.end)})</span>
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
                    <span class="m365-agenda-time">${_m365FmtTime(ev.start)}-${_m365FmtTime(ev.end)} (${_m365Duration(ev.start, ev.end)})</span>
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

function _m365RenderDetails(eventData) {
    const body = _m365State.detailsBody;
    const headActions = _m365State.detailsHeadActions;
    if (!body || !eventData) return;
    const preview = _m365NormalizeBodyPreview(eventData.bodyPreview);
    const now = Date.now();
    const startTs = new Date(eventData.start).getTime();
    const endTs = new Date(eventData.end).getTime();
    const inProgress = Number.isFinite(startTs) && Number.isFinite(endTs) && startTs <= now && endTs >= now;
    const startsIn = startTs > now ? _m365TimeUntilStart(eventData.start) : '';
    const endsIn = inProgress ? _m365TimeUntilStart(eventData.end) : '';
    const statusLabel = inProgress ? 'In progress' : (startTs > now ? 'Upcoming' : 'Finished');
    const meetingType = eventData.joinUrl ? 'Online meeting' : 'In person';
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
    const tzLabel = _m365GetConfig().timezone || localTz;

    if (headActions) {
        headActions.innerHTML = eventData.joinUrl
            ? `<a class="m365-join-btn m365-join-btn--lg" href="${_m365Esc(eventData.joinUrl)}" target="_blank" rel="noopener noreferrer">Join meeting</a>`
            : '<span class="m365-join-offline m365-join-offline--lg" aria-label="In person meeting">In person</span>';
    }

    body.innerHTML = `
        <h4>${_m365Esc(eventData.subject)}</h4>
        <div class="m365-detail-row"><strong>Date:</strong> ${_m365Esc(_m365FmtDate(eventData.start))}</div>
        <div class="m365-detail-row"><strong>Time:</strong> ${_m365FmtTime(eventData.start)}-${_m365FmtTime(eventData.end)} (${_m365Duration(eventData.start, eventData.end)})</div>
        ${startsIn ? `<div class="m365-detail-row"><strong>Starts in:</strong> ${_m365Esc(startsIn)}</div>` : ''}
        ${endsIn ? `<div class="m365-detail-row"><strong>Ends in:</strong> ${_m365Esc(endsIn)}</div>` : ''}
        <div class="m365-detail-row"><strong>Status:</strong> ${_m365Esc(statusLabel)}</div>
        <div class="m365-detail-row"><strong>Type:</strong> ${_m365Esc(meetingType)}</div>
        <div class="m365-detail-row"><strong>Timezone:</strong> ${_m365Esc(tzLabel)}</div>
        <div class="m365-detail-row"><strong>Location:</strong> ${_m365Esc(eventData.location || '-')}</div>
        <div class="m365-detail-row"><strong>Organizer:</strong> ${_m365Esc(eventData.organizer || '-')}</div>
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
