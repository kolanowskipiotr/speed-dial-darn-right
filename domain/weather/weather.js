// ─── WEATHER DOMAIN ──────────────────────────────────────────────
// Free API: Open-Meteo (no API key required). https://open-meteo.com

const WEATHER_KEY = 'speedDial_weather';

// Module state
let _weatherConfig = null;   // { enabled:boolean, city?, lat, lon, label, unit:'C'|'F' }
let _weatherData = null;     // cached Open-Meteo response
let _weatherLastFetch = 0;   // ms timestamp
let _weatherInterval = null;
let _weatherState = {
    fetchInFlight: 0,
    lastError: null,
    everLoaded: false,
};

const _WMO_ICON = {
    0:'☀️', 1:'🌤️', 2:'⛅', 3:'☁️',
    45:'🌫️', 48:'🌫️',
    51:'🌦️', 53:'🌦️', 55:'🌧️', 56:'🌦️', 57:'🌧️',
    61:'🌧️', 63:'🌧️', 65:'🌧️', 66:'🌧️', 67:'🌧️',
    71:'🌨️', 73:'🌨️', 75:'🌨️', 77:'🌨️',
    80:'🌦️', 81:'🌦️', 82:'🌧️',
    85:'🌨️', 86:'🌨️',
    95:'⛈️', 96:'⛈️', 99:'⛈️'
};

const _WMO_LABEL = {
    0:'Clear sky', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast',
    45:'Fog', 48:'Icy fog',
    51:'Light drizzle', 53:'Drizzle', 55:'Heavy drizzle',
    61:'Light rain', 63:'Rain', 65:'Heavy rain',
    71:'Light snow', 73:'Snow', 75:'Heavy snow',
    80:'Showers', 81:'Rain showers', 82:'Heavy showers',
    95:'Thunderstorm', 96:'Thunderstorm + hail', 99:'Thunderstorm + heavy hail'
};

function _wmoIcon(code) { return _WMO_ICON[code] ?? '🌡️'; }
function _wmoLabel(code) { return _WMO_LABEL[code] ?? ''; }

function _fmtTemp(c) {
    if (_weatherConfig?.unit === 'F') return `${Math.round(c * 9 / 5 + 32)}°F`;
    return `${Math.round(c)}°C`;
}

function _normalizeWeatherConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return null;
    return {
        ...cfg,
        enabled: cfg.enabled !== false,
    };
}

function _loadWeatherConfig() {
    try {
        const raw = localStorage.getItem(WEATHER_KEY);
        _weatherConfig = _normalizeWeatherConfig(raw ? JSON.parse(raw) : null);
    } catch {
        _weatherConfig = null;
    }
}

function _saveWeatherCfg(cfg) {
    _weatherConfig = _normalizeWeatherConfig(cfg);
    localStorage.setItem(WEATHER_KEY, JSON.stringify(_weatherConfig));
}

function _stripDiacritics(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

async function _geocodeCity(city) {
    const input = String(city || '').trim();
    if (!input) throw new Error('CITY_NOT_FOUND');

    const variants = [input];
    const asciiFallback = _stripDiacritics(input);
    if (asciiFallback && asciiFallback !== input) variants.push(asciiFallback);

    for (const query of variants) {
        let res;
        try {
            res = await fetch(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`
            );
        } catch (error) {
            throw new Error(error?.message || 'Network request failed');
        }

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();
        if (!json.results?.length) continue;

        const r = json.results[0];
        return { lat: r.latitude, lon: r.longitude, label: `${r.name}, ${r.country}` };
    }

    throw new Error('CITY_NOT_FOUND');
}

async function _doFetchWeather() {
    if (!_weatherConfig?.lat || !_weatherConfig?.lon) return;
    const now = Date.now();
    if (_weatherData && now - _weatherLastFetch < 30 * 60 * 1000) return;

    const { lat, lon } = _weatherConfig;
    const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,weather_code,apparent_temperature` +
        `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
        `&forecast_days=7` +
        `&timezone=auto`;

    _weatherState.fetchInFlight += 1;
    _updateWeatherIndicator();
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        _weatherData = await res.json();
        _weatherLastFetch = now;
        _weatherState.lastError = null;
        _weatherState.everLoaded = true;
    } catch (error) {
        _weatherState.lastError = error?.message || 'unknown error';
        throw error;
    } finally {
        _weatherState.fetchInFlight = Math.max(0, _weatherState.fetchInFlight - 1);
        _updateWeatherIndicator();
    }
}

function _updateWeatherIndicator() {
    const btn = document.getElementById('weatherIndicator');
    if (!btn) return;

    const cfg = _weatherConfig;
    let cls = '';
    let label = '';

    if (_weatherState.fetchInFlight > 0) {
        cls = 'updating';
        label = 'Weather integration: updating...';
    } else if (_weatherState.lastError) {
        cls = 'conflict';
        label = `Weather integration: error - ${_weatherState.lastError}`;
    } else if (!cfg || cfg.enabled === false) {
        label = 'Weather integration: disabled';
    } else if (!cfg.lat || !cfg.lon) {
        label = 'Weather integration: enabled (location not configured)';
    } else {
        cls = 'connected';
        label = _weatherState.everLoaded
            ? 'Weather integration: active'
            : 'Weather integration: enabled';
    }

    btn.className = 'gdrive-indicator' + (cls ? ` ${cls}` : '');
    btn.dataset.label = label;
}

function _openWeatherDetails() {
    if (!_weatherConfig || _weatherConfig.enabled === false) {
        openWeatherConfigModal();
        return;
    }
    const q = _weatherConfig.label || _weatherConfig.city || `${_weatherConfig.lat},${_weatherConfig.lon}`;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(`weather ${q}`)}`, '_blank', 'noopener');
}

function _buildInlineCard({ label, icon, sublabel, mainTemp, temp, isNow }) {
    return `
        <div class="weather-inline-card${isNow ? ' weather-inline-now' : ''}">
            <div class="weather-inline-icon">${icon}</div>
            <div class="weather-inline-label">${label}</div>
            <div></div>
            <div class="weather-inline-sublabel">${sublabel}</div>
            <div class="weather-inline-main-temp">${mainTemp}</div>
            <div class="weather-inline-temp">${temp}</div>
        </div>
    `;
}

function _updateInline() {
    const root = document.getElementById('headerWeatherInline');
    if (!root) return;
    const weatherCol = root.closest('.header-weather-col');

    if (_weatherConfig?.enabled === false) {
        if (weatherCol) weatherCol.classList.add('weather-col-hidden');
        root.innerHTML = '';
        root.title = '';
        root.style.opacity = '';
        return;
    }

    if (weatherCol) weatherCol.classList.remove('weather-col-hidden');

    if (!_weatherConfig) {
        root.innerHTML = '<div class="weather-inline-empty">Set weather in Edit mode</div>';
        root.title = 'Configure weather in Edit mode';
        root.style.opacity = '0.7';
        return;
    }

    if (!_weatherData?.current) {
        root.innerHTML = `<div class="weather-inline-empty">${ICONS.loading} Loading weather...</div>`;
        root.title = 'Weather is loading';
        root.style.opacity = '0.8';
        return;
    }

    const c = _weatherData.current;
    const cards = [
        _buildInlineCard({
            label: 'Now',
            icon: _wmoIcon(c.weather_code),
            sublabel: 'feels',
            mainTemp: _fmtTemp(c.temperature_2m),
            temp: _fmtTemp(c.apparent_temperature),
            isNow: true
        })
    ];

    const daily = _weatherData.daily;
    if (daily?.time?.length) {
        const count = Math.min(daily.time.length, 6);
        for (let i = 0; i < count; i++) {
            const d = new Date(daily.time[i] + 'T12:00:00');
            const label = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
            cards.push(_buildInlineCard({
                label,
                icon: _wmoIcon(daily.weather_code[i]),
                sublabel: 'min',
                mainTemp: _fmtTemp(daily.temperature_2m_max[i]),
                temp: _fmtTemp(daily.temperature_2m_min[i]),
                isNow: false
            }));
        }
    }

    root.innerHTML = `<div class="weather-inline-strip">${cards.join('')}</div>`;
    root.title = `${_weatherConfig.label || 'Weather'}. Click to open detailed weather in a new tab.`;
    root.style.opacity = '';
}

function _setWeatherUnit(activeUnit) {
    const btnC = document.getElementById('weatherUnitC');
    const btnF = document.getElementById('weatherUnitF');
    if (!btnC || !btnF) return;
    btnC.classList.toggle('active', activeUnit !== 'F');
    btnF.classList.toggle('active', activeUnit === 'F');
}

function _setWeatherEnabled(enabled) {
    const toggle = document.getElementById('weatherWidgetToggle');
    if (!toggle) return;
    toggle.classList.toggle('active', enabled !== false);
}

function openWeatherConfigModal() {
    const cfg = _weatherConfig || {};
    const cityInput = document.getElementById('weatherCityInput');
    const latInput = document.getElementById('weatherLatInput');
    const lonInput = document.getElementById('weatherLonInput');
    const status = document.getElementById('weatherCfgStatus');
    if (!cityInput || !latInput || !lonInput || !status) return;
    cityInput.value = cfg.city || '';
    latInput.value = cfg.city ? '' : (cfg.lat ?? '');
    lonInput.value = cfg.city ? '' : (cfg.lon ?? '');
    status.textContent = '';
    _setWeatherUnit(cfg.unit || 'C');
    _setWeatherEnabled(cfg.enabled !== false);
    openModal('weatherModal');
}

async function _saveWeatherConfigFromModal() {
    const btnF = document.getElementById('weatherUnitF');
    const widgetToggle = document.getElementById('weatherWidgetToggle');
    const cityInput = document.getElementById('weatherCityInput');
    const latInput = document.getElementById('weatherLatInput');
    const lonInput = document.getElementById('weatherLonInput');
    const status = document.getElementById('weatherCfgStatus');
    if (!btnF || !widgetToggle || !cityInput || !latInput || !lonInput || !status) return;

    const prevCfg = _weatherConfig || {};
    const city = cityInput.value.trim();
    const latV = latInput.value.trim();
    const lonV = lonInput.value.trim();
    const unit = btnF.classList.contains('active') ? 'F' : 'C';
    const enabled = widgetToggle.classList.contains('active');
    status.textContent = '';

    let newCfg = { unit, enabled };
    if (city) {
        status.textContent = `${ICONS.loading} Looking up city...`;
        try {
            const geo = await _geocodeCity(city);
            newCfg = { ...newCfg, city, lat: geo.lat, lon: geo.lon, label: geo.label };
        } catch (error) {
            _weatherState.lastError = error?.message === 'CITY_NOT_FOUND'
                ? 'city not found'
                : (error?.message || 'network error');
            _updateWeatherIndicator();
            status.textContent = error?.message === 'CITY_NOT_FOUND'
                ? `${ICONS.error} City not found`
                : `${ICONS.error} Geocoding failed`;
             return;
         }
    } else if (latV && lonV) {
        const lat = parseFloat(latV);
        const lon = parseFloat(lonV);
        if (isNaN(lat) || isNaN(lon)) {
            status.textContent = `${ICONS.warn} Invalid coordinates`;
            return;
        }
        newCfg = { ...newCfg, lat, lon, label: `${lat.toFixed(3)}, ${lon.toFixed(3)}` };
    } else if (prevCfg.lat && prevCfg.lon) {
        newCfg = {
            ...newCfg,
            city: prevCfg.city,
            lat: prevCfg.lat,
            lon: prevCfg.lon,
            label: prevCfg.label || `${Number(prevCfg.lat).toFixed(3)}, ${Number(prevCfg.lon).toFixed(3)}`,
        };
    } else if (!enabled) {
        // Allow turning widget visibility off before location is configured.
        newCfg = { ...newCfg, city: prevCfg.city || '', label: prevCfg.label || '' };
    } else {
        status.textContent = `${ICONS.warn} Enter city or coordinates`;
        return;
    }

    _saveWeatherCfg(newCfg);
    _weatherData = null;
    _weatherLastFetch = 0;
    _weatherState.lastError = null;
    _updateInline();
    _updateWeatherIndicator();

    if (!enabled) {
        status.textContent = `${ICONS.ok} Weather widget hidden`;
        setTimeout(() => closeModal('weatherModal'), 250);
        return;
    }

    status.textContent = `${ICONS.loading} Fetching weather...`;
    try {
        await _doFetchWeather();
        _updateInline();
        status.textContent = `${ICONS.ok} Weather saved`;
        setTimeout(() => closeModal('weatherModal'), 250);
    } catch {
        status.textContent = `${ICONS.error} Network error`;
    }
}

function _bindWeatherModal() {
    const btnC = document.getElementById('weatherUnitC');
    const btnF = document.getElementById('weatherUnitF');
    const widgetToggle = document.getElementById('weatherWidgetToggle');
    const saveBtn = document.getElementById('weatherSaveBtn');
    if (!btnC || !btnF || !widgetToggle || !saveBtn) return;

    btnC.addEventListener('click', () => _setWeatherUnit('C'));
    btnF.addEventListener('click', () => _setWeatherUnit('F'));
    widgetToggle.addEventListener('click', () => widgetToggle.classList.toggle('active'));
    saveBtn.addEventListener('click', _saveWeatherConfigFromModal);
}

async function _fetchAndUpdate() {
    if (_weatherConfig?.enabled === false) {
        _updateWeatherIndicator();
        return;
    }
    try {
        await _doFetchWeather();
        _updateInline();
    } catch (e) {
        console.warn('[weather] fetch failed:', e);
    }
}

async function initWeather() {
    _loadWeatherConfig();
    _bindWeatherModal();
    _updateInline();
    _updateWeatherIndicator();

    const inline = document.getElementById('headerWeatherInline');
    if (inline) {
        inline.addEventListener('click', _openWeatherDetails);
        inline.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                _openWeatherDetails();
            }
        });
    }

    if (_weatherConfig?.lat && _weatherConfig?.lon) {
        _fetchAndUpdate();
    }

    if (_weatherInterval) clearInterval(_weatherInterval);
    _weatherInterval = setInterval(_fetchAndUpdate, 30 * 60 * 1000);
}
