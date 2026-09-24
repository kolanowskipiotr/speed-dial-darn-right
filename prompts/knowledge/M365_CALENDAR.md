# M365 Calendar Widget — Debugging Guide

Dotyczy: `domain/calendar/m365.js`, `domain/ui/header.css`, `uploader/m365-calendar.js`

---

## Architektura

- **Frontend widget**: `domain/calendar/m365.js` — inicjalizacja, event listenery, renderowanie agendy i detali spotkania, silnik alertów dźwiękowych.
- **Serwer ICS**: `uploader/m365-calendar.js` — pobieranie i parsowanie feedu ICS z Outlook365, cache 60s, filtrowanie/sortowanie eventów.
- **Endpointy**: `uploader/server.js` obsługuje `/api/m365/*` — proxy do serwera Node na porcie 3001.
- **Testy**: `tests/uploader/m365/calendar-logic.test.js` i `server-calendar.test.js` — uruchamiać przez `node --test tests/uploader/m365/*.test.js`.

---

## Funkcja alertu dźwiękowego (bell notification)

### Zachowanie
- **Okno alertu**: od `start - 3 minuty` do `start + 3 minuty`.
- W tym oknie gra seria 2 stuków (`domain/calendar/bell.mp3`) z przerwami zależnymi od czasu do startu (patrz „Harmonogram”).
- Ikona 🔔 pojawia się obok przycisku Join w widoku compact.
- Kliknięcie 🔔 wycisza dźwięk → ikona zmienia się na 🔕 (przezroczysta).
- Kliknięcie 🔕 ponownie włącza dźwięk (`alertMutedForId` → `null`).
- Po opuszczeniu okna alertu wszystko resetuje się; nowe spotkanie zaczyna od nowa bez wyciszenia.

### Harmonogram (`M365_BELL_PHASES`, T = start spotkania)
| Faza | Przerwa po serii |
|------|------------------|
| T-3:00 → T-1:30 | 30 s |
| T-1:30 → T-0:30 | 15 s |
| T-0:30 → T+0:15 | 5 s ← szczyt |
| T+0:15 → T+1:00 | 15 s |
| T+1:00 → T+3:00 | 60 s |

Uzasadnienie (ustalone z użytkownikiem): krótsza przerwa = większa odczuwana pilność (badania nad ostrzeżeniami dźwiękowymi — Edworthy/Hellier), zmiana tempa ogranicza habituację. Szczyt jest **przed** startem, bo dołączenie trwa ~30–60 s. Po starcie szybkie wygaszanie — jeśli brak reakcji, użytkownik prawdopodobnie jest poza biurkiem, a dźwięk tylko przeszkadza otoczeniu (alarm fatigue). Łącznie ~20 serii w 6 min.

- Przerwa jest wybierana **wg zegara** (offset od `ev.start`) przed każdą serią, nie wg licznika serii — reload strony / odciszenie w środku okna od razu trafia we właściwą fazę.
- Pętla to łańcuch `setTimeout` (długość serii + przerwa), nie `setInterval`. Sama się kończy po `T + M365_ALERT_WINDOW_MS`.
- Stałe: `M365_BELL_KNOCKS` (2), `M365_BELL_KNOCK_GAP_MS` (150), `M365_BELL_PHASES`, `M365_ALERT_WINDOW_MS` (3 min, współdzielone z `_m365CheckAlertState`).

### Kluczowe funkcje w `m365.js`
| Funkcja | Opis |
|---------|------|
| `_m365CheckAlertState()` | Sprawdza co 10 s czy jesteśmy w oknie alertu; uruchamia/zatrzymuje pętlę dźwięku |
| `_m365StartAlertLoop(startTs?)` | Gra serię od razu, kolejne wg `M365_BELL_PHASES`. `startTs` domyślnie z `_m365State.nextEvent` |
| `_m365StopAlertLoop()` | Czyści timeout i unieważnia token pętli |
| `_m365PlayBell()` | Gra jedną serię (`M365_BELL_KNOCKS` stuków); zwraca Promise z długością serii w ms (0 przy błędzie) |
| `_m365LoadBell(ctx)` | Jednorazowy `fetch` + `decodeAudioData` mp3, cache w `_m365BellBuffer` |
| `_m365UnlockAudio()` | Na pierwszy pointerdown/keydown/touchstart: `ctx.resume()` + preload mp3 |
| `_m365ToggleBellMute()` | Przełącza wyciszenie dla bieżącego spotkania |
| `_m365GetAudioContext()` | Leniwe tworzenie/reużywanie `AudioContext` |

### Stan alertu w `_m365State`
```js
alertWindowActive: false,  // true gdy jesteśmy w oknie ±3min
alertMutedForId: null,     // ID spotkania, które zostało wyciszone
alertSoundTimer: null,     // token pętli dźwięku { timeout } — porównywany w tick(), by stare pętle nie grały
alertCheckTimer: null,     // interval sprawdzający okno alertu (co 10s)
```

### Dźwięk — Web Audio API + mp3
- Plik: `domain/calendar/bell.mp3` (glass knock, ~0,19 s, 6 KB). Serwowany statycznie z `domain/` (dev mount + `COPY domain` w Dockerfile).
- Odtwarzany przez `AudioBufferSource` we wspólnym `AudioContext`, **nie** przez `<audio>` — element `<audio>` odpalany z timera byłby blokowany przez autoplay policy.
- Zapisywanie zdekodowanej wersji (WAV/próbki) nie ma sensu: dekodowanie jest jednorazowe i trwa ułamek ms, WAV byłby ~5× większy.
- Jeśli przeglądarka blokuje audio (brak gestu użytkownika) lub plik się nie załaduje, dźwięk nie gra (brak fallbacku) — ikona dzwonka nadal się pojawia.

### Test z konsoli DevTools
Najpierw kliknąć na stronie (odblokowanie audio), potem:
```js
_m365PlayBell()                           // jedna seria
_m365StartAlertLoop(Date.now() + 20000)   // szczyt (start za 20 s)
_m365StartAlertLoop(Date.now() + 170000)  // początek okna, co 30 s
_m365StopAlertLoop()
```

### CSS (w `domain/ui/header.css`)
- `.m365-bell-btn` — bazowy styl dzwonka z animacją dzwonienia (`@keyframes m365-bell-ring`).
- `.m365-bell-btn--muted` — wyłącza animację, zmniejsza opacity do 0.4.
- `@media (prefers-reduced-motion: reduce)` — wyłącza animację.

### ICONS (w `domain/core/state.js`)
- `ICONS.bell` = `'🔔'`
- `ICONS.bellMuted` = `'🔕'`

---

## Znane błędy i ich naprawy

### 1. Popover nie wyświetla się po kliknięciu (race condition)

**Symptom**: Kliknięcie na box kalendarza powoduje krótkie miganie loadera, po czym popover znika.

**Przyczyna**: Listener `click` wykrywał kliknięcie jako "outside" ponieważ `event.target.closest()` sprawdza aktualny DOM — który może być zmutowany przez `_m365LoadAgenda()` podczas asynchronicznego re-renderu.

**Naprawa**: Zamienić `event.target.closest()` na `event.composedPath()` — ta metoda zwraca niezmienną migawkę ścieżki eventu w momencie jego wystrzelenia.

```javascript
document.addEventListener('click', (event) => {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const target = event.target;

    // fallback dla przeglądarek bez composedPath
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
```

**Zasada ogólna**: Jeśli DOM jest mutowany podczas obsługi eventu (np. async re-render), nigdy nie używaj `event.target.closest()` do wykrywania "click outside" — używaj `event.composedPath()`.

---

### 2. Popover niewidoczny mimo klasy `.open` (CSS display/visibility)

**Symptom**: Klasa `.open` jest dodawana do elementu, ale popover pozostaje ukryty.

**Przyczyna**: Sama właściwość `display: block` może nie wystarczyć jeśli `visibility: hidden` lub `opacity: 0` są ustawione gdzie indziej.

**Naprawa**: Kontrolować kompletny zestaw właściwości widoczności:

```css
.m365-popover {
    display: none;
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition), visibility var(--transition);
}

.m365-popover.open {
    display: block;
    visibility: visible;
    opacity: 1;
    pointer-events: auto;
}
```

**Ważne**: Nigdy nie używać `!important` — zamiast tego używać wyższej specyficzności CSS (np. `#m365AgendaPopover` zamiast `.m365-popover`).

---

### 3. Błąd parsera ICS: `E is not defined`

**Symptom**: `[m365] Failed to open agenda: "E is not defined"` w konsoli przeglądarki.

**Przyczyna**: Dosłowna literówka w `uploader/m365-calendar.js` — zbłąkany znak na końcu linii:
```javascript
// ŹLE:
const lhs = line.slice(0, idx);E
// DOBRZE:
const lhs = line.slice(0, idx);
```

**Naprawa**: Usunąć zbłąkany znak. Weryfikacja: `node --test tests/uploader/m365/*.test.js` (wszystkie 15 testów powinny przejść).

---

### 4. Wyświetlanie przeszłych lub błędnych spotkań

**Symptom A**: Widget pokazuje spotkanie z przeszłości (np. z lutego gdy jest kwiecień).

**Przyczyna**: `expandRecurringEvents()` nie filtrowała eventów wcześniejszych niż okno czasowe.

**Naprawa** (w `uploader/m365-calendar.js`):
```javascript
// Dodać warunek event.end >= windowStart:
const out = events.filter((event) => (!event.rrule || event.recurrenceId) && event.end >= windowStart);
```

**Symptom B**: `pickNextNotCanceled()` nie rozróżnia spotkań "w trakcie" od przyszłych — może pomijać aktualnie trwające.

**Naprawa**:
```javascript
function pickNextNotCanceled(events, nowMs = Date.now()) {
    // Priorytet 1: spotkanie aktualnie trwające (start <= now <= end)
    return events.find((e) => !e.isCancelled && e.start.getTime() <= nowMs && e.end.getTime() >= nowMs)
        // Priorytet 2: następne przyszłe spotkanie
        || events.find((e) => !e.isCancelled && e.start.getTime() >= nowMs)
        || null;
}
```

---

### 5. Brakujące spotkania z TZID w cudzysłowach zawierającym dwukropek

**Symptom**: Spotkania widoczne w kalendarzu Outlook nie pojawiają się w agendzie widgetu. Żadnego błędu w konsoli.

**Przyczyna**: `parseLine()` używał `line.indexOf(':')` — trafiał w dwukropek **wewnątrz** nazwy strefy czasowej w cudzysłowiu, np.:
```
DTSTART;TZID="(UTC+01:00) Sarajevo, Skopje, Warsaw, Zagreb":20260505T113000
```
Pierwszym dwukropkiem był ten w `UTC+01:00`, więc wartość daty była śmieciem → `parseIcsDate()` zwracał `null` → event był odrzucany bez błędu.

**Naprawa** (`parseLine` w `uploader/m365-calendar.js`):
```javascript
// Znaleź pierwszy dwukropek NIE wewnątrz cudzysłowu
let inQuote = false;
let idx = -1;
for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ':' && !inQuote) { idx = i; break; }
}
```

**Ponadto** — dodano `parseVTimezones()` i zależność `windows-iana` (npm). Outlook eksportuje TZID w dwóch formatach:
- **Windows KEY name** (`Central Europe Standard Time` w bloku VTIMEZONE) → mapowane przez `windows-iana` (`findIana()`)
- **Display name** (`(UTC+01:00) Sarajevo, Skopje, Warsaw, Zagreb` w DTSTART) → wyciągany base offset, dopasowywany do wpisu VTIMEZONE z tym samym offsetem → DST-aware IANA

Nie wymaga ręcznej mapy stref czasowych.

**Zasada ogólna**: W ICS parametry mogą zawierać cytowane wartości z dwukropkami. Zawsze parsuj pierwszy **niecytowany** dwukropek jako separator name:value.

---

### 6. Spotkanie pokazuje czas o 1 godzinę za późno (błąd DST przy Windows display-name TZID)

**Symptom**: Widget pokazuje spotkanie o 14:30-15:30, podczas gdy w Outlooku (i w ICS) jest 13:30-14:30. Błąd pojawia się tylko latem (podczas DST).

**Przyczyna**: Outlook eksportuje dwa formaty TZID dla tej samej strefy:
- W bloku VTIMEZONE: `TZID:(UTC+01:00) Sarajevo\, Skopje\, Warsaw\, Zagreb` (z escaped przecinkami)
- W DTSTART: `TZID="(UTC+01:00) Sarajevo, Skopje, Warsaw, Zagreb"` (z prawdziwymi przecinkami w cudzysłowiu)

Funkcja `parseVTimezones()` budowała vtimezoneMap z kluczem `(UTC+01:00) Sarajevo, Skopje, Warsaw, Zagreb` (po unescapowaniu), ale nie znajdowała dla niego prawidłowej nazwy IANA (bo to nie jest ani nazwa IANA, ani Windows KEY name). Zapisywała `iana: null`.

Następnie `normalizeIanaTimeZone()` w kroku 4 szukała wpisu vtimezoneMap z `entry.iana !== null && entry.stdOffsetMin === 60`. Nie znajdowała żadnego → fallback do `Etc/GMT-1` (UTC+1 stały, **bez DST**).

Wynik: 13:30 local → 12:30 UTC (z offsetem +01:00) zamiast 11:30 UTC (z offsetem +02:00 CEST). Widget wyświetlał 14:30 Warsaw zamiast 13:30.

**Naprawa** (`uploader/m365-calendar.js`):

1. **`parseVTimezones()`** — przechowuje teraz również `dstOffsetMin` (offset z bloku `BEGIN:DAYLIGHT`):
```javascript
map[tzid] = { iana: iana || null, stdOffsetMin, dstOffsetMin };
```

2. Dodano helper `_getTimezoneOffsetMin(iana, utcDate)` — zwraca offset UTC w minutach dla danej strefy IANA o zadanym czasie UTC.

3. **`normalizeIanaTimeZone(rawTz, vtimezoneMap, defaultTimeZone = '')`** — nowy 3. parametr. W kroku 4, gdy nie znaleziono wpisu z `iana !== null`, sprawdza `defaultTimeZone`:
```javascript
if (defaultTimeZone) {
    const thisEntry = vtimezoneMap[value]; // wpis dla display-name TZID
    if (thisEntry && thisEntry.stdOffsetMin === baseMin) {
        const winterRef = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
        const dtStdOffset = _getTimezoneOffsetMin(defaultTimeZone, winterRef);
        if (dtStdOffset === baseMin) {
            if (thisEntry.dstOffsetMin === null) return defaultTimeZone;
            const summerRef = new Date(Date.UTC(2026, 6, 15, 12, 0, 0));
            if (_getTimezoneOffsetMin(defaultTimeZone, summerRef) === thisEntry.dstOffsetMin) {
                return defaultTimeZone; // ✅ np. "Europe/Warsaw"
            }
        }
    }
}
```

4. Wywołania `normalizeIanaTimeZone` zaktualizowane, żeby przekazywały `defaultTimeZone`:
   - W `parseIcsDate()`: `normalizeIanaTimeZone(params.TZID, options.vtimezoneMap, options.defaultTimeZone)`
   - W `parseIcsEvents()`: `normalizeIanaTimeZone(event.raw.DTSTART?.params?.TZID, vtimezoneMap, parseOpts.defaultTimeZone)`

**Wynik**: `(UTC+01:00) Sarajevo, Skopje, Warsaw, Zagreb` → szuka, czy `Europe/Warsaw` ma std=+01:00 i DST=+02:00 → tak → zwraca `Europe/Warsaw` → 13:30 Warsaw CEST = **11:30 UTC** ✓.

**Test regresyjny**: `'Outlook Windows display-name TZID with DST is parsed correctly (regression: 1h off in summer)'` w `tests/uploader/m365/calendar-logic.test.js`.

**Zasada ogólna**: Gdy VTIMEZONE blok istnieje dla display-name TZID, ale nie da się go zmapować na IANA, użyj `defaultTimeZone` skonfigurowanego przez użytkownika jako DST-aware fallback — pod warunkiem że oba offsety (std i DST) pasują do wartości z VTIMEZONE.

---

### 7. Spotkanie całodniowe (all-day) pokazuje błędny zakres godzin (np. "02:00-02:00")

**Symptom**: Wydarzenie całodniowe (`DTSTART;VALUE=DATE`) w Outlooku pokazuje w widgecie zerowy/dziwny zakres godzin (np. "02:00-02:00") zamiast informacji, że to wydarzenie całodniowe.

**Przyczyna**: `parseIcsDate()` poprawnie parsuje `VALUE=DATE` na północ UTC (`Date.UTC(y, m-1, d)`), ale `parseIcsEvents()` nigdy nie ustawiał flagi `isAllDay` na zwracanym obiekcie eventu — `serializeEvent()` (linia z `isAllDay: !!event.isAllDay`) zawsze zwracała `false`. Front-end (`domain/calendar/m365.js`) formatował więc `start`/`end` (północ UTC) jako godzinę lokalną (np. 02:00 CEST w Europe/Warsaw) i pokazywał ją jako zwykły zakres czasu.

**Naprawa**:
1. W `parseIcsEvents()` (`uploader/m365-calendar.js`) dodano obliczanie `isAllDay`:
```javascript
const isAllDay = event.raw.DTSTART?.params?.VALUE === 'DATE' || /^\d{8}$/.test(event.raw.DTSTART?.value || '');
```
i przekazanie go do zwracanego obiektu eventu (trafia do `serializeEvent()` bez zmian).

2. W `domain/calendar/m365.js` dodano helper `_m365FmtTimeRange(ev)`, który zwraca `'Full day'` gdy `ev.isAllDay`, używany we wszystkich trzech miejscach renderowania czasu (compact, agenda, details popover) zamiast bezpośredniego `_m365FmtTime(start)-_m365FmtTime(end)`.

3. Alert dźwiękowy (`_m365CheckAlertState`) i liczniki "Starts in"/"Ends in" w popoverze detali są też wyłączone dla `isAllDay` — liczenie ±3min okna alertu względem północy UTC nie ma sensu dla wydarzenia całodniowego.

**Test regresyjny**: `'all-day (VALUE=DATE) event is flagged isAllDay'` w `tests/uploader/m365/calendar-logic.test.js`.

**Zasada ogólna**: Każde pole obliczone w `parseIcsEvents()` musi być faktycznie zwrócone w obiekcie eventu — sama poprawna logika w `parseIcsDate()` nie wystarczy, jeśli wynikowa flaga nigdy nie trafia dalej do `serializeEvent()`/front-endu.

---

### 8. Spotkanie "widmo" (ghost) na starym terminie po przełożeniu cyklicznego spotkania

**Symptom**: Widget pokazuje spotkanie cykliczne (np. "co 4 tygodnie w piątek") na jego **starym** terminie, mimo że organizator przełożył je na inny dzień — a w prawdziwym kalendarzu Outlook to spotkanie na starym terminie już nie istnieje. Refresh/hard-refresh nie pomaga, bo dane z serwera są poprawne — błąd jest w logice ekspansji rekurencji.

**Przyczyna**: `expandRecurringEvents()` (`uploader/m365-calendar.js`) buduje `explicitKeys` — zbiór terminów, które mają już jawny VEVENT z `RECURRENCE-ID` (czyli "nie generuj tu syntetycznego wystąpienia z RRULE, bo już jest override"). Klucz był budowany z `event.start`:
```javascript
// ŹLE:
const explicitKeys = new Set(explicit.map((event) => toOccurrenceKey(event.id, event.start)));
```
Gdy organizator przekłada spotkanie, override VEVENT ma `RECURRENCE-ID` = stary termin, ale `DTSTART` = nowy termin (to normalne w ICS — `RECURRENCE-ID` identyfikuje, które wystąpienie serii jest zastępowane, `DTSTART` mówi kiedy naprawdę się teraz odbywa). Klucz budowany z `event.start` wskazywał więc na **nowy** termin zamiast na **stary**, więc zbiór `explicitKeys` nie zawierał klucza dla starego terminu. Syntetyczna generacja z `RRULE` (dla `FREQ=WEEKLY`/`DAILY`) nie znajdowała dopasowania i tworzyła **dodatkowe, widmowe** wystąpienie na starym terminie — obok prawdziwego, przełożonego wystąpienia na nowym terminie.

**Pułapka nazewnictwa**: Spotkanie nazwane "Monthly Sprints Review" może mieć w ICS `RRULE:FREQ=WEEKLY;INTERVAL=4;BYDAY=FR` (czyli "co 4 tygodnie"), a nie `FREQ=MONTHLY` — więc **jest** aktywnie ekspandowane przez `expandRecurringEvents()` (który obsługuje tylko `DAILY`/`WEEKLY`). Nie zakładaj częstotliwości cyklu na podstawie nazwy wydarzenia — zawsze sprawdź faktyczne `RRULE` w surowym ICS.

**Naprawa** (`uploader/m365-calendar.js`):
```javascript
// DOBRZE — klucz z recurrenceId (stary termin, który override zastępuje), nie ze start (nowy termin):
const explicitKeys = new Set(explicit.map((event) => toOccurrenceKey(event.id, event.recurrenceId)));
```

**Diagnostyka**: Użyj `__test__.parseIcsEvents()` i `__test__.expandRecurringEvents()` (eksportowane z `uploader/m365-calendar.js`) na pobranym ręcznie ICS, żeby zobaczyć wszystkie wystąpienia danego UID ze start/end/recurrenceId — widmowe wystąpienie ma `recurrenceId === start` (bo zostało wygenerowane syntetycznie z `RRULE`), podczas gdy prawdziwy override ma `recurrenceId !== start` (bo to właśnie różnica między starym a nowym terminem).

**Zasada ogólna**: `RECURRENCE-ID` identyfikuje, **które** wystąpienie serii jest nadpisywane — nigdy nie używaj `event.start` (nowy, faktyczny termin) tam, gdzie potrzebny jest klucz do de-duplikacji względem oryginalnego miejsca w harmonogramie cyklu.

---

## Struktura danych ICS z Outlook

- Outlook eksportuje cykliczne spotkania jako **osobne VEVENT** dla każdej instancji (nie jako jeden event z RRULE).
- Wyjątek: niektóre eventy mogą mieć RRULE — parser musi obsługiwać oba formaty.
- `RECURRENCE-ID` wskazuje, że dany VEVENT jest konkretną instancją (np. zmienioną) serii cyklicznej.
- Strefy czasowe: Outlook używa **Windows display names** (np. `(UTC+01:00) Sarajevo, Skopje, Warsaw, Zagreb`) zamiast IANA. Parser mapuje je przez `_WINDOWS_TZ_MAP` na strefy IANA.
- W przypadku podejrzenia złych dat: sprawdź mapowanie stref czasowych w parserze.

---

## Diagnostyka "złej daty" — checklist

Jeśli widget wyświetla błędną datę spotkania:

1. **Sprawdź cache serwera**: TTL = 60s. Poczekaj minutę i odśwież (hard refresh: Cmd+Shift+R).
2. **Pobierz feed ICS ręcznie**:
   ```bash
   curl -s "https://outlook.office365.com/owa/calendar/..." | grep -A 20 "SUMMARY:Nazwa Spotkania"
   ```
3. **Sprawdź DTSTART** dla poszukiwanego spotkania w surowym feedzie.
4. **Zweryfikuj mapowanie stref** — czy `W. Europe Standard Time` mapuje się poprawnie na `Europe/Warsaw`?
5. **Uruchom testy**: `node --test tests/uploader/m365/*.test.js` — powinno być 15/15.
6. **Sprawdź `expandRecurringEvents()`** — czy `windowStart` jest poprawnie ustawiony?

---

## Testy

```bash
# Uruchom wszystkie testy M365
node --test tests/uploader/m365/*.test.js

# Weryfikacja skryptem diagnostycznym
node prompts/plans/M365_CALENDAR/scripts/m365-verify.mjs
node prompts/plans/M365_CALENDAR/scripts/m365-verify-ics.mjs
```

Pliki testów:
- `tests/uploader/m365/calendar-logic.test.js` — logika filtrowania/sortowania/parsowania
- `tests/uploader/m365/server-calendar.test.js` — integracja endpointu serwera

