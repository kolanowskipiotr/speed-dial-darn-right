// ─── WEATHER DOMAIN ──────────────────────────────────────────────
// Free API: Open-Meteo (no API key required). https://open-meteo.com

const WEATHER_KEY = 'speedDial_weather';

// Module state
let _weatherConfig = null;   // { city?, lat, lon, label, unit:'C'|'F' }
let _weatherData = null;     // cached Open-Meteo response
let _weatherLastFetch = 0;   // ms timestamp
let _weatherInterval = null;

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

function _loadWeatherConfig() {
    try {
        const raw = localStorage.getItem(WEATHER_KEY);
        _weatherConfig = raw ? JSON.parse(raw) : null;
    } catch {
        _weatherConfig = null;
    }
}

function _saveWeatherCfg(cfg) {
    _weatherConfig = cfg;
    localStorage.setItem(WEATHER_KEY, JSON.stringify(cfg));
}

async function _geocodeCity(city) {
    const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
    );
    const json = await res.json();
    if (!json.results?.length) throw new Error('City not found');
    const r = json.results[0];
    return { lat: r.latitude, lon: r.longitude, label: `${r.name}, ${r.country}` };
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

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _weatherData = await res.json();
    _weatherLastFetch = now;
}

function _openWeatherDetails() {
    if (!_weatherConfig) {
        openWeatherConfigModal();
        return;
    }
    const q = _weatherConfig.label || _weatherConfig.city || `${_weatherConfig.lat},${_weatherConfig.lon}`;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(`weather ${q}`)}`, '_blank', 'noopener');
}

function _buildInlineCard({ label, icon, top, bottom, isNow }) {
    return `
        <div class="weather-inline-card${isNow ? ' weather-inline-now' : ''}">
            <div class="weather-inline-row">
                <div class="weather-inline-icon">${icon}</div>
                <div class="weather-inline-label">${label}</div>
            </div>
            <div class="weather-inline-row">
                <div class="weather-inline-top">${top}</div>
                <div class="weather-inline-bottom">${bottom}</div>
            </div>
        </div>
    `;
}

function _updateInline() {
    const root = document.getElementById('headerWeatherInline');
    if (!root) return;

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
            top: _fmtTemp(c.temperature_2m),
            bottom: `feels ${_fmtTemp(c.apparent_temperature)}`,
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
                top: _fmtTemp(daily.temperature_2m_max[i]),
                bottom: `min ${_fmtTemp(daily.temperature_2m_min[i])}`,
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
    openModal('weatherModal');
}

async function _saveWeatherConfigFromModal() {
    const btnF = document.getElementById('weatherUnitF');
    const cityInput = document.getElementById('weatherCityInput');
    const latInput = document.getElementById('weatherLatInput');
    const lonInput = document.getElementById('weatherLonInput');
    const status = document.getElementById('weatherCfgStatus');
    if (!btnF || !cityInput || !latInput || !lonInput || !status) return;

    const city = cityInput.value.trim();
    const latV = latInput.value.trim();
    const lonV = lonInput.value.trim();
    const unit = btnF.classList.contains('active') ? 'F' : 'C';
    status.textContent = '';

    let newCfg = { unit };
    if (city) {
        status.textContent = `${ICONS.loading} Looking up city...`;
        try {
            const geo = await _geocodeCity(city);
            newCfg = { ...newCfg, city, lat: geo.lat, lon: geo.lon, label: geo.label };
        } catch {
            status.textContent = `${ICONS.error} City not found`;
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
    } else {
        status.textContent = `${ICONS.warn} Enter city or coordinates`;
        return;
    }

    _saveWeatherCfg(newCfg);
    _weatherData = null;
    _weatherLastFetch = 0;
    _updateInline();

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
    const saveBtn = document.getElementById('weatherSaveBtn');
    if (!btnC || !btnF || !saveBtn) return;

    btnC.addEventListener('click', () => _setWeatherUnit('C'));
    btnF.addEventListener('click', () => _setWeatherUnit('F'));
    saveBtn.addEventListener('click', _saveWeatherConfigFromModal);
}

async function _fetchAndUpdate() {
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
