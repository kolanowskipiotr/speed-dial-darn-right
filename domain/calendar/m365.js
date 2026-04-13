let _m365State = {
    compact: null,
    agendaPopover: null,
    detailsPopover: null,
    agendaBody: null,
    detailsBody: null,
    nextEvent: null,
    agendaDays: [],
    compactTimer: null,
    agendaTimer: null,
    countdownTimer: null,
};

const _M365_DEFAULT_CONFIG = {
    enabled: true,
    icsUrl: '',
    timezone: '',
};

function _m365GetConfig() {
    const raw = (typeof m365CalendarConfig === 'object' && m365CalendarConfig) ? m365CalendarConfig : {};
    return {
        enabled: raw.enabled !== false,
        icsUrl: raw.icsUrl || '',
        timezone: raw.timezone || '',
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

function _m365ApplyEnabledState() {
    const root = _m365State.compact?.closest('.header-m365-col');
    if (!root) return;
    const cfg = _m365GetConfig();
    root.style.display = cfg.enabled ? '' : 'none';
    if (!cfg.enabled) _m365HideAgenda();
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
        target.innerHTML = '<span class="m365-label">Next</span><span class="m365-empty">No meeting</span>';
        return;
    }

    const inProgress = new Date(ev.start) <= new Date() && new Date(ev.end) >= new Date();
    const countdown = !inProgress ? _m365TimeUntilStart(ev.start) : '';
    target.classList.add('has-event');
    target.innerHTML = [
        '<span class="m365-label">Next</span>',
        `<span class="m365-compact-row">
            <span class="m365-time">${_m365FmtTime(ev.start)}-${_m365FmtTime(ev.end)} (${_m365Duration(ev.start, ev.end)})</span>
            ${countdown ? `<span class="m365-countdown">Starts in ${countdown}</span>` : ''}
            ${ev.joinUrl
                ? `<a class="m365-join-btn" href="${_m365Esc(ev.joinUrl)}" target="_blank" rel="noopener noreferrer">Join</a>`
                : '<span class="m365-join-offline" aria-label="In person meeting">In person</span>'}
        </span>`,
        `<span class="m365-subject">${_m365Esc(ev.subject)}</span>`,
        inProgress ? '<span class="m365-state">In progress</span>' : '',
    ].join('');
}

function _m365RenderAgenda() {
    const body = _m365State.agendaBody;
    if (!body) return;

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
    if (!body || !eventData) return;

    body.innerHTML = `
        <h4>${_m365Esc(eventData.subject)}</h4>
        <div><strong>Time:</strong> ${_m365FmtTime(eventData.start)}-${_m365FmtTime(eventData.end)} (${_m365Duration(eventData.start, eventData.end)})</div>
        <div><strong>Location:</strong> ${_m365Esc(eventData.location || '-')}</div>
        <div><strong>Organizer:</strong> ${_m365Esc(eventData.organizer || '-')}</div>
        ${eventData.joinUrl
            ? `<div style="margin-top:8px"><a class="m365-join-btn m365-join-btn--lg" href="${_m365Esc(eventData.joinUrl)}" target="_blank" rel="noopener noreferrer">Join meeting</a></div>`
            : '<div style="margin-top:8px"><span class="m365-join-offline m365-join-offline--lg" aria-label="In person meeting">In person</span></div>'}
        ${eventData.bodyPreview ? `<p class="m365-body-preview">${_m365Esc(eventData.bodyPreview)}</p>` : ''}
    `;

    _m365State.detailsPopover?.classList.add('open');
}

async function _m365LoadNext() {
    if (!_m365GetConfig().enabled) return;
    if (!_m365CanLoadCalendar()) {
        _m365State.nextEvent = null;
        _m365RenderCompact();
        return;
    }
    _m365ShowCompactLoading();
    try {
        const payload = await _m365FetchJson('/api/m365/calendar/next');
        _m365State.nextEvent = payload.next;
        _m365RenderCompact();
    } catch (error) {
        _m365RenderCompact();
        throw error;
    }
}

async function _m365LoadAgenda(forceOpen = false) {
    if (!_m365GetConfig().enabled) return;
    if (!_m365CanLoadCalendar()) {
        _m365State.agendaDays = [];
        _m365RenderCompact();
        _m365RenderAgenda();
        return;
    }
    const payload = await _m365FetchJson('/api/m365/calendar/agenda?days=5&workingDays=true');
    _m365State.agendaDays = payload.days || [];
    _m365RenderCompact();
    _m365RenderAgenda();
    if (forceOpen) _m365State.agendaPopover?.classList.add('open');
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
    body.innerHTML = '<div class="m365-loading">Loading meeting details…</div>';
    _m365State.detailsPopover?.classList.add('open');
}

async function _m365OpenDetails(eventId) {
    if (!eventId) return;
    _m365ShowDetailsLoading();
    try {
        const payload = await _m365FetchJson(`/api/m365/calendar/event?eventId=${encodeURIComponent(eventId)}`);
        if (!payload.event) {
            if (_m365State.detailsBody) _m365State.detailsBody.innerHTML = '<div class="m365-empty-block">Meeting details unavailable.</div>';
            return;
        }
        _m365RenderDetails(payload.event);
    } catch (error) {
        if (_m365State.detailsBody) _m365State.detailsBody.innerHTML = '<div class="m365-empty-block">Meeting details unavailable.</div>';
        throw error;
    }
}

function _m365ScheduleRefresh() {
    if (_m365State.compactTimer) clearInterval(_m365State.compactTimer);
    if (_m365State.agendaTimer) clearInterval(_m365State.agendaTimer);
    if (_m365State.countdownTimer) clearInterval(_m365State.countdownTimer);

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

function openM365ConfigModal() {
    const cfg = _m365GetConfig();
    const icsInput = document.getElementById('m365IcsUrlInput');
    const timezone = document.getElementById('m365TimezoneInput');
    const status = document.getElementById('m365CfgStatus');
    if (!icsInput || !timezone || !status) return;

    icsInput.value = cfg.icsUrl;
    timezone.value = cfg.timezone;
    status.textContent = '';
    _setM365EnabledToggle(cfg.enabled);
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
    };

    const icsValidation = _m365ValidateHttpUrl(nextConfig.icsUrl);
    if (!icsValidation.ok) {
        status.textContent = `${ICONS.warn} ${icsValidation.message}`;
        return;
    }
    nextConfig.icsUrl = icsValidation.value;

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
    _bindM365ConfigModal();

    if (!_m365State.compact || !_m365State.agendaPopover) return;
    _m365ApplyEnabledState();

    _m365State.compact.addEventListener('click', async (event) => {
        if (event.target.closest('.m365-join-btn')) return;
        const willOpen = !_m365State.agendaPopover.classList.contains('open');
        if (!willOpen) {
            _m365HideAgenda();
            return;
        }

        _m365ShowAgendaLoading();
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
        const target = event.target;
        if (!target.closest('.header-m365-col')) _m365HideAgenda();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            _m365LoadNext().catch(() => {});
            _m365LoadAgenda(false).catch(() => {});
        }
    });

    if (_m365GetConfig().enabled) {
        _m365LoadNext().catch((error) => console.warn('[m365] initial compact failed:', error.message));
        _m365LoadAgenda(false).catch(() => {});
    }
    _m365ScheduleRefresh();
}
